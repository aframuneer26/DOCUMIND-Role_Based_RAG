const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Multer config - store temporarily
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/temp');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Helper to extract a useful error message from axios errors
const getErrMsg = (err) => {
  if (err.code === 'ECONNREFUSED') {
    return 'Python RAG service is not running. Please start it on port 8001.';
  }
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    return 'Python RAG service timed out. The document may be too large or the service is overloaded.';
  }
  if (err.response?.data?.detail) return err.response.data.detail;
  if (err.response?.data?.error) return err.response.data.error;
  if (err.message) return err.message;
  return 'Unknown error occurred';
};

// Upload document (Admin only)
router.post('/upload', authenticate, requireAdmin, upload.single('document'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  const { title, access_type = 'admin_only' } = req.body;
  if (!['admin_only', 'all_users', 'selected_users'].includes(access_type)) {
    return res.status(400).json({ error: 'Invalid access_type. Must be admin_only, all_users, or selected_users' });
  }

  // First check if Python service is reachable
  try {
    await axios.get(`${process.env.PYTHON_SERVICE_URL}/health`, { timeout: 5000 });
  } catch (err) {
    // Clean up temp file
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(503).json({
      error: 'Python RAG service is not running. Please start the python_service (port 8001) before uploading documents.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert document record
    const docResult = await client.query(
      `INSERT INTO documents (title, filename, file_size, uploaded_by, access_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        title || req.file.originalname,
        req.file.originalname,
        req.file.size,
        req.user.id,
        access_type
      ]
    );
    const documentId = docResult.rows[0].id;

    // Send file to Python RAG service for processing
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    formData.append('document_id', documentId);

    console.log(`Processing document: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    const ragResponse = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/process-document`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 300000 // 5 min for large PDFs
      }
    );

    const { total_chunks, faiss_index_id, chunks } = ragResponse.data;

    // Update document with FAISS info
    await client.query(
      `UPDATE documents SET total_chunks = $1, faiss_index_id = $2 WHERE id = $3`,
      [total_chunks, faiss_index_id, documentId]
    );

    // Store chunks in PostgreSQL with parameterized queries
    if (chunks && chunks.length > 0) {
      console.log(`Storing ${chunks.length} chunks in PostgreSQL...`);
      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          `INSERT INTO document_chunks (document_id, chunk_index, content, faiss_vector_id, token_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            documentId,
            i,
            chunks[i].content,
            chunks[i].faiss_id !== undefined ? chunks[i].faiss_id : null,
            chunks[i].token_count || null
          ]
        );
      }
    }

    await client.query('COMMIT');

    // Clean up temp file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    console.log(`✅ Document uploaded: "${title || req.file.originalname}" — ${total_chunks} chunks`);

    res.status(201).json({
      message: 'Document uploaded and processed successfully',
      document: {
        id: documentId,
        title: title || req.file.originalname,
        total_chunks,
        access_type
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    // Clean up temp file on error
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    const msg = getErrMsg(err);
    console.error('Upload error:', msg);
    res.status(500).json({ error: 'Failed to process document: ' + msg });
  } finally {
    client.release();
  }
});

// Get documents (Admin sees all; Users see only accessible ones)
router.get('/', authenticate, async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'admin') {
      query = `
        SELECT d.id, d.title, d.filename, d.file_size, d.total_chunks,
               d.access_type, d.is_active, d.created_at, d.updated_at,
               u.username as uploader_name,
               COUNT(dc.id)::int as chunk_count
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_chunks dc ON dc.document_id = d.id
        WHERE d.is_active = true
        GROUP BY d.id, u.username
        ORDER BY d.created_at DESC
      `;
      params = [];
    } else {
      // Users only see document titles (NOT filenames/content) if they have access
      query = `
        SELECT d.id, d.title, d.access_type, d.total_chunks, d.created_at
        FROM documents d
        LEFT JOIN document_access da ON da.document_id = d.id AND da.user_id = $1
        WHERE d.is_active = true
          AND (
            d.access_type = 'all_users'
            OR (d.access_type = 'selected_users' AND da.user_id IS NOT NULL)
          )
        ORDER BY d.created_at DESC
      `;
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json({ documents: result.rows });
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Delete document (Admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const docResult = await client.query(
      'SELECT id, faiss_index_id FROM documents WHERE id = $1',
      [req.params.id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Notify Python service to remove from FAISS
    const { faiss_index_id } = docResult.rows[0];
    if (faiss_index_id) {
      try {
        await axios.delete(`${process.env.PYTHON_SERVICE_URL}/document/${faiss_index_id}`, { timeout: 5000 });
      } catch (e) {
        console.warn('Failed to remove from FAISS (service may be down):', e.code || e.message);
      }
    }

    await client.query('DELETE FROM document_access WHERE document_id = $1', [req.params.id]);
    await client.query('DELETE FROM document_chunks WHERE document_id = $1', [req.params.id]);
    await client.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  } finally {
    client.release();
  }
});

// Update document access type (Admin only)
router.patch('/:id/access', authenticate, requireAdmin, async (req, res) => {
  const { access_type } = req.body;
  if (!['admin_only', 'all_users', 'selected_users'].includes(access_type)) {
    return res.status(400).json({ error: 'Invalid access_type' });
  }

  try {
    const result = await pool.query(
      'UPDATE documents SET access_type = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [access_type, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    res.json({ message: 'Document access updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update access' });
  }
});

module.exports = router;

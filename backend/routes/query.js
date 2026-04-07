const express = require('express');
const axios = require('axios');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Ask a question (authenticated users)
router.post('/ask', authenticate, async (req, res) => {
  const { question, document_ids } = req.body;

  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const startTime = Date.now();

  try {
    // Determine which documents the user can access
    let accessibleDocIds;

    if (req.user.role === 'admin') {
      // Admin can query all active documents (or filter by document_ids)
      if (document_ids && document_ids.length > 0) {
        const result = await pool.query(
          `SELECT id FROM documents WHERE id = ANY($1::uuid[]) AND is_active = true`,
          [document_ids]
        );
        accessibleDocIds = result.rows.map(r => r.id);
      } else {
        const result = await pool.query(`SELECT id FROM documents WHERE is_active = true`);
        accessibleDocIds = result.rows.map(r => r.id);
      }
    } else {
      // User can only query docs they have access to
      const result = await pool.query(
        `SELECT d.id FROM documents d
         LEFT JOIN document_access da ON da.document_id = d.id AND da.user_id = $1
         WHERE d.is_active = true
           AND (
             d.access_type = 'all_users'
             OR (d.access_type = 'selected_users' AND da.user_id IS NOT NULL)
           )
           ${document_ids && document_ids.length > 0 ? 'AND d.id = ANY($2::uuid[])' : ''}`,
        document_ids && document_ids.length > 0
          ? [req.user.id, document_ids]
          : [req.user.id]
      );
      accessibleDocIds = result.rows.map(r => r.id);
    }

    if (accessibleDocIds.length === 0) {
      return res.status(403).json({
        error: 'No accessible documents found. You may not have access to query these documents.'
      });
    }

    // Send query to Python RAG service
    const ragResponse = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/query`,
      {
        question: question.trim(),
        document_ids: accessibleDocIds,
        user_id: req.user.id,
        user_role: req.user.role
      },
      { timeout: 60000 }
    );

    const { answer, sources, tokens_used } = ragResponse.data;
    const responseTime = Date.now() - startTime;

    // Log the query
    await pool.query(
      `INSERT INTO query_logs (user_id, query, response, documents_used, response_time_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        question,
        answer,
        accessibleDocIds,
        responseTime
      ]
    );

    res.json({
      question,
      answer,
      sources: sources || [],
      response_time_ms: responseTime
    });
  } catch (err) {
    console.error('Query error:', err.message);
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'RAG service is unavailable. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to process query: ' + err.message });
  }
});

// Get query history for the logged-in user
router.get('/history', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await pool.query(
      `SELECT id, query, response, response_time_ms, created_at
       FROM query_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );
    res.json({ history: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;

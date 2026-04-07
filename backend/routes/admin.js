const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all users (Admin only)
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Grant document access to specific users (Admin only)
router.post('/documents/:docId/grant-access', authenticate, requireAdmin, async (req, res) => {
  const { user_ids } = req.body;
  const { docId } = req.params;

  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify document exists
    const docCheck = await client.query('SELECT id FROM documents WHERE id = $1', [docId]);
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update access type to selected_users if not already
    await client.query(
      `UPDATE documents SET access_type = 'selected_users', updated_at = NOW() WHERE id = $1`,
      [docId]
    );

    // Insert access grants (ignore duplicates)
    for (const userId of user_ids) {
      await client.query(
        `INSERT INTO document_access (document_id, user_id, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (document_id, user_id) DO NOTHING`,
        [docId, userId, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: `Access granted to ${user_ids.length} user(s)` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Grant access error:', err);
    res.status(500).json({ error: 'Failed to grant access' });
  } finally {
    client.release();
  }
});

// Revoke document access from specific users (Admin only)
router.post('/documents/:docId/revoke-access', authenticate, requireAdmin, async (req, res) => {
  const { user_ids } = req.body;
  const { docId } = req.params;

  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids array required' });
  }

  try {
    await pool.query(
      `DELETE FROM document_access WHERE document_id = $1 AND user_id = ANY($2::uuid[])`,
      [docId, user_ids]
    );
    res.json({ message: 'Access revoked successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

// Get users who have access to a document (Admin only)
router.get('/documents/:docId/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, da.granted_at
       FROM document_access da
       JOIN users u ON da.user_id = u.id
       WHERE da.document_id = $1`,
      [req.params.docId]
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch document users' });
  }
});

// Toggle user active status (Admin only)
router.patch('/users/:userId/toggle-status', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND role != 'admin'
       RETURNING id, username, is_active`,
      [req.params.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or cannot modify admin' });
    }
    res.json({ user: result.rows[0], message: `User ${result.rows[0].is_active ? 'activated' : 'deactivated'}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Get system stats (Admin only)
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const [users, docs, queries] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN role=\'user\' THEN 1 END) as users, COUNT(CASE WHEN role=\'admin\' THEN 1 END) as admins FROM users WHERE is_active=true'),
      pool.query('SELECT COUNT(*) as total, SUM(total_chunks) as total_chunks FROM documents WHERE is_active=true'),
      pool.query('SELECT COUNT(*) as total FROM query_logs WHERE created_at > NOW() - INTERVAL \'24 hours\'')
    ]);

    res.json({
      stats: {
        total_users: parseInt(users.rows[0].total),
        regular_users: parseInt(users.rows[0].users),
        admins: parseInt(users.rows[0].admins),
        total_documents: parseInt(docs.rows[0].total),
        total_chunks: parseInt(docs.rows[0].total_chunks) || 0,
        queries_last_24h: parseInt(queries.rows[0].total)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;

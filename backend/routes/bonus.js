// Bonus prediction routes (user-facing)
// POST /api/bonus/answer   — submit or update an answer to a bonus question

const express = require('express');
const pool = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/bonus/answer
// Body: { question_id, answer }
router.post('/answer', requireAuth, async (req, res) => {
  const { question_id, answer } = req.body;

  if (!question_id || answer == null || String(answer).trim() === '') {
    return res.status(400).json({ error: 'question_id and answer are required' });
  }

  const trimmed = String(answer).trim();

  try {
    // Load the question and its match kickoff time + status
    const qRes = await pool.query(
      `SELECT bq.*, m.kickoff_time, m.status AS match_status
       FROM bonus_questions bq
       JOIN matches m ON m.id = bq.match_id
       WHERE bq.id = $1`,
      [question_id]
    );
    const q = qRes.rows[0];
    if (!q) return res.status(404).json({ error: 'Question not found' });

    const openStatuses = ['SCHEDULED', 'TIMED'];
    if (new Date() >= new Date(q.kickoff_time) || !openStatuses.includes(q.match_status)) {
      return res.status(403).json({ error: 'Predictions locked — match has already started' });
    }

    if (q.type === 'country' && !['home', 'away', 'none'].includes(trimmed)) {
      return res.status(400).json({ error: 'Country answer must be "home", "away", or "none"' });
    }

    await pool.query(
      `INSERT INTO bonus_answers (user_id, question_id, answer, submitted_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET answer = $3, submitted_at = NOW()`,
      [req.user.id, question_id, trimmed]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Bonus answer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

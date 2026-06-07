// Admin routes — only accessible to admin users
// POST   /api/admin/users            — create a new user
// GET    /api/admin/users            — list all users
// DELETE /api/admin/users/:id        — delete a user
// PUT    /api/admin/users/:id/password — change a user's password
// GET    /api/admin/scoring          — get scoring config
// PUT    /api/admin/scoring          — update scoring config values
// GET    /api/admin/predictions      — see all predictions from all users
// POST   /api/admin/sync             — manually trigger a score sync
// GET    /api/admin/sync-logs        — view recent sync logs

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/index');
const { requireAdmin } = require('../middleware/auth');
const { runSync } = require('../jobs/syncScores');

const router = express.Router();

// All admin routes require admin authentication
router.use(requireAdmin);

// POST /api/admin/users — create a new user account
// Body: { name, password, is_admin? }
router.post('/users', async (req, res) => {
  const { name, password, is_admin = false } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, password_hash, is_admin)
       VALUES ($1, $2, $3) RETURNING id, name, is_admin, created_at`,
      [name, hash, is_admin]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ error: 'A user with this name already exists' });
    }
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.is_admin, u.created_at,
              COALESCE(SUM(p.points_earned), 0) as total_points,
              COUNT(p.id) as total_predictions
       FROM users u
       LEFT JOIN predictions p ON u.id = p.user_id
       GROUP BY u.id ORDER BY u.created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — remove a user
router.delete('/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id/password — change a user's password
router.put('/users/:id/password', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password is required' });
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/scoring — get all scoring config values
router.get('/scoring', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scoring_config ORDER BY key');
    res.json(result.rows);
  } catch (err) {
    console.error('Scoring config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/scoring — update one or more scoring config values
// Body: { key: value, ... } e.g. { "base_points": 15, "multiplier_exact": 4 }
router.put('/scoring', async (req, res) => {
  const updates = req.body;
  try {
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        'UPDATE scoring_config SET value = $1 WHERE key = $2',
        [value, key]
      );
    }
    const result = await pool.query('SELECT * FROM scoring_config ORDER BY key');
    res.json(result.rows);
  } catch (err) {
    console.error('Update scoring error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/predictions — all predictions from all users
router.get('/predictions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.name as user_name,
              m.home_team, m.away_team, m.kickoff_time, m.stage,
              m.status, m.home_score AS match_home, m.away_score AS match_away
       FROM predictions p
       JOIN users u ON p.user_id = u.id
       JOIN matches m ON p.match_id = m.id
       ORDER BY m.kickoff_time ASC, u.name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('All predictions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Bonus question management ─────────────────────────────────────────────────

// GET /api/admin/bonus/matches — all matches with their bonus questions
router.get('/bonus/matches', async (req, res) => {
  try {
    const { rows: matches } = await pool.query(
      `SELECT id, home_team, away_team, home_team_code, away_team_code,
              kickoff_time, stage, group_name, status
       FROM matches ORDER BY kickoff_time ASC`
    );
    const { rows: questions } = await pool.query(
      `SELECT * FROM bonus_questions ORDER BY match_id, created_at ASC`
    );
    const qMap = {};
    questions.forEach(q => {
      if (!qMap[q.match_id]) qMap[q.match_id] = [];
      qMap[q.match_id].push(q);
    });
    res.json(matches.map(m => ({ ...m, bonus_questions: qMap[m.id] || [] })));
  } catch (err) {
    console.error('Admin bonus matches error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/bonus — create a bonus question for a match
// Body: { match_id, type, question }
router.post('/bonus', async (req, res) => {
  const { match_id, type, question } = req.body;
  if (!match_id || !type || !question?.trim()) {
    return res.status(400).json({ error: 'match_id, type, and question are required' });
  }
  if (!['country', 'player'].includes(type)) {
    return res.status(400).json({ error: 'type must be country or player' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO bonus_questions (match_id, type, question)
       VALUES ($1, $2, $3) RETURNING *`,
      [match_id, type, question.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create bonus question error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/bonus/:id — delete a bonus question
router.delete('/bonus/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bonus_questions WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete bonus question error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/bonus/:id/answer — set the correct answer for a question
// Body: { correct_answer }
router.put('/bonus/:id/answer', async (req, res) => {
  const { correct_answer } = req.body;
  if (!correct_answer?.trim()) {
    return res.status(400).json({ error: 'correct_answer is required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE bonus_questions SET correct_answer = $1 WHERE id = $2 RETURNING *`,
      [correct_answer.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Question not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Set bonus answer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/bonus/:id/submissions — all user answers for a question, sorted by frequency
router.get('/bonus/:id/submissions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ba.answer, COUNT(*) AS count, ARRAY_AGG(u.name ORDER BY u.name) AS users
       FROM bonus_answers ba
       JOIN users u ON u.id = ba.user_id
       WHERE ba.question_id = $1
       GROUP BY ba.answer
       ORDER BY count DESC, ba.answer ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Bonus submissions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/sync — manually trigger a score sync from football-data.org
router.post('/sync', async (req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    console.error('Manual sync error:', err);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

// GET /api/admin/sync-logs — recent sync history
router.get('/sync-logs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sync_logs ORDER BY synced_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Sync logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

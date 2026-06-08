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

// PUT /api/admin/bonus/:id/answer — set the correct answer and award points to users
// Body: { correct_answer }
router.put('/bonus/:id/answer', async (req, res) => {
  const { correct_answer } = req.body;
  if (correct_answer == null || String(correct_answer).trim() === '') {
    return res.status(400).json({ error: 'correct_answer is required' });
  }
  const trimmed = String(correct_answer).trim();
  try {
    const { rows } = await pool.query(
      `UPDATE bonus_questions SET correct_answer = $1 WHERE id = $2 RETURNING *`,
      [trimmed, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Question not found' });
    const q = rows[0];

    // Points: 3 for country questions, 5 for player questions
    const points = q.type === 'country' ? 3 : 5;

    // Award points to correct answers, 0 to wrong ones
    if (q.type === 'country') {
      // Country answers are exact string matches (home/away/none)
      await pool.query(
        `UPDATE bonus_answers SET points_earned = $1 WHERE question_id = $2 AND answer = $3`,
        [points, q.id, trimmed]
      );
      await pool.query(
        `UPDATE bonus_answers SET points_earned = 0 WHERE question_id = $1 AND answer != $2`,
        [q.id, trimmed]
      );
    } else {
      // Player answers are case-insensitive
      await pool.query(
        `UPDATE bonus_answers SET points_earned = $1
         WHERE question_id = $2 AND LOWER(TRIM(answer)) = LOWER(TRIM($3))`,
        [points, q.id, trimmed]
      );
      await pool.query(
        `UPDATE bonus_answers SET points_earned = 0
         WHERE question_id = $1 AND LOWER(TRIM(answer)) != LOWER(TRIM($2))`,
        [q.id, trimmed]
      );
    }

    res.json(q);
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

// ── Question templates ────────────────────────────────────────────────────────

// GET /api/admin/question-templates — list all templates
router.get('/question-templates', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM question_templates ORDER BY type, created_at ASC');
    res.json(rows);
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/question-templates — create a template
// Body: { type, question }
router.post('/question-templates', async (req, res) => {
  const { type, question } = req.body;
  if (!type || !question?.trim()) {
    return res.status(400).json({ error: 'type and question are required' });
  }
  if (!['country', 'player'].includes(type)) {
    return res.status(400).json({ error: 'type must be country or player' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO question_templates (type, question) VALUES ($1, $2) RETURNING *',
      [type, question.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/question-templates/:id — delete a template
router.delete('/question-templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM question_templates WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/question-templates/assign — randomly assign templates to selected matches
// Body: { match_ids: number[], count_per_match?: number }
// Picks `count_per_match` random templates (without replacement within a match) and creates
// bonus_questions for each selected match. Skips matches that already have questions.
router.post('/question-templates/assign', async (req, res) => {
  const { match_ids, count_per_match = 1, skip_existing = false } = req.body;
  if (!Array.isArray(match_ids) || match_ids.length === 0) {
    return res.status(400).json({ error: 'match_ids must be a non-empty array' });
  }

  try {
    const { rows: templates } = await pool.query('SELECT * FROM question_templates');
    if (templates.length === 0) {
      return res.status(400).json({ error: 'No question templates found — create some first' });
    }

    const n = Math.min(Number(count_per_match) || 1, templates.length);
    let created = 0;
    let skipped = 0;

    for (const matchId of match_ids) {
      if (skip_existing) {
        const { rows: existing } = await pool.query(
          'SELECT id FROM bonus_questions WHERE match_id = $1 LIMIT 1',
          [matchId]
        );
        if (existing.length > 0) { skipped++; continue; }
      }

      // Shuffle templates and pick the first n
      const shuffled = [...templates].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, n);

      for (const t of picked) {
        await pool.query(
          'INSERT INTO bonus_questions (match_id, type, question) VALUES ($1, $2, $3)',
          [matchId, t.type, t.question]
        );
        created++;
      }
    }

    res.json({ ok: true, created, skipped });
  } catch (err) {
    console.error('Assign templates error:', err);
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

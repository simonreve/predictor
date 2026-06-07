// Match routes: list matches with optional predictions for the logged-in user
// GET /api/matches          — all matches grouped by stage, with user's prediction if logged in
// GET /api/matches/:id      — single match detail

const express = require('express');
const pool = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/matches
// Returns all matches. If authenticated, also includes the user's prediction for each match.
router.get('/', requireAuth, async (req, res) => {
  try {
    const matchesResult = await pool.query(
      `SELECT * FROM matches ORDER BY kickoff_time ASC`
    );

    // Fetch the user's predictions for all matches in one query
    const predsResult = await pool.query(
      `SELECT match_id, home_score, away_score, bonus_prediction_type, bonus_prediction_value, submitted_at, points_earned
       FROM predictions WHERE user_id = $1`,
      [req.user.id]
    );

    // Fetch bonus questions + this user's answers in one query
    const bonusResult = await pool.query(
      `SELECT bq.id, bq.match_id, bq.type, bq.question, bq.correct_answer,
              ba.answer AS my_answer
       FROM bonus_questions bq
       LEFT JOIN bonus_answers ba ON ba.question_id = bq.id AND ba.user_id = $1
       ORDER BY bq.match_id, bq.created_at ASC`,
      [req.user.id]
    );

    // Build lookup maps
    const predMap = {};
    predsResult.rows.forEach(p => { predMap[p.match_id] = p; });

    const bonusMap = {};
    bonusResult.rows.forEach(q => {
      if (!bonusMap[q.match_id]) bonusMap[q.match_id] = [];
      bonusMap[q.match_id].push(q);
    });

    // Attach prediction + bonus questions to each match
    const matches = matchesResult.rows.map(m => ({
      ...m,
      my_prediction:    predMap[m.id]  || null,
      bonus_questions:  bonusMap[m.id] || [],
    }));

    res.json(matches);
  } catch (err) {
    console.error('Matches error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/matches/:id — single match with all predictions (for display purposes)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const matchResult = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (!matchResult.rows[0]) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json(matchResult.rows[0]);
  } catch (err) {
    console.error('Match detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

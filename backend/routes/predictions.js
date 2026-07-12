// Prediction routes: submit and update predictions
// POST /api/predictions     — create or update a prediction for a match
// GET  /api/predictions/me  — get all of the logged-in user's predictions

const express = require('express');
const pool = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/predictions
// Body: { match_id, home_score, away_score, bonus_prediction_type?, bonus_prediction_value? }
// Creates a prediction or updates an existing one (upsert)
// Fails if the match has already kicked off
router.post('/', requireAuth, async (req, res) => {
  const { match_id, home_score, away_score, bonus_prediction_type = null, bonus_prediction_value = null } = req.body;

  if (match_id == null || home_score == null || away_score == null) {
    return res.status(400).json({ error: 'match_id, home_score, and away_score are required' });
  }
  if (home_score < 0 || away_score < 0 || !Number.isInteger(home_score) || !Number.isInteger(away_score)) {
    return res.status(400).json({ error: 'Scores must be non-negative integers' });
  }

  const normalizedBonusType = bonus_prediction_type || null;
  const normalizedBonusValue = typeof bonus_prediction_value === 'string'
    ? bonus_prediction_value.trim()
    : bonus_prediction_value;

  if (normalizedBonusType && !['country', 'player'].includes(normalizedBonusType)) {
    return res.status(400).json({ error: 'bonus_prediction_type must be country or player' });
  }

  if ((normalizedBonusType && !normalizedBonusValue) || (!normalizedBonusType && normalizedBonusValue)) {
    return res.status(400).json({ error: 'bonus_prediction_type and bonus_prediction_value must be provided together' });
  }

  try {
    // Check that the match exists and hasn't kicked off yet
    const matchResult = await pool.query('SELECT * FROM matches WHERE id = $1', [match_id]);
    const match = matchResult.rows[0];

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Lock predictions once kickoff time has passed OR match is no longer in a pre-game state
    const openStatuses = ['SCHEDULED', 'TIMED'];
    if (new Date() >= new Date(match.kickoff_time) || !openStatuses.includes(match.status)) {
      return res.status(403).json({ error: 'Predictions are locked — match has already started' });
    }

    if (normalizedBonusType === 'country') {
      const allowedCountries = new Set(['home', 'away']);
      if (!allowedCountries.has(normalizedBonusValue)) {
        return res.status(400).json({ error: 'Country predictions must be home or away' });
      }
    }

    if (normalizedBonusType === 'player' && !normalizedBonusValue) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    // Upsert: insert prediction or update if one already exists for this user+match
    const result = await pool.query(
      `INSERT INTO predictions (user_id, match_id, home_score, away_score, bonus_prediction_type, bonus_prediction_value, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, match_id)
       DO UPDATE SET home_score = $3, away_score = $4,
                     bonus_prediction_type = $5, bonus_prediction_value = $6,
                     submitted_at = NOW()
       RETURNING *`,
      [req.user.id, match_id, home_score, away_score, normalizedBonusType, normalizedBonusValue]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/predictions/me — all predictions for the logged-in user, joined with match info
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.user_id, m.id AS match_id, p.home_score, p.away_score,
              p.bonus_prediction_type, p.bonus_prediction_value, p.submitted_at,
              p.points_earned, p.score_raw_points, p.score_multiplier,
              p.bonus_points_earned, p.score_breakdown,
              m.home_team, m.away_team, m.kickoff_time, m.stage,
              m.status AS match_status, m.home_score AS match_home_score, m.away_score AS match_away_score,
              m.home_team_code, m.away_team_code,
              COALESCE(bonus.bonus_points, 0) AS computed_bonus_points
       FROM matches m
       LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = $1
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(
           CASE WHEN EXISTS (
             SELECT 1
             FROM unnest(
               CASE
                 WHEN COALESCE(array_length(bq.correct_answers, 1), 0) > 0
                   THEN bq.correct_answers
                 WHEN bq.correct_answer IS NOT NULL AND bq.correct_answer != ''
                   THEN ARRAY[bq.correct_answer]::text[]
                 ELSE ARRAY[]::text[]
               END
             ) accepted(answer)
             WHERE LOWER(TRIM(accepted.answer)) = LOWER(TRIM(ba.answer))
           )
           THEN CASE bq.type WHEN 'player' THEN 5 WHEN 'yesno' THEN 2 ELSE 3 END
           ELSE 0 END
         ), 0) AS bonus_points
         FROM bonus_answers ba
         JOIN bonus_questions bq ON bq.id = ba.question_id
         WHERE ba.user_id = $1 AND bq.match_id = m.id
       ) bonus ON TRUE
       WHERE p.id IS NOT NULL OR EXISTS (
         SELECT 1
         FROM bonus_answers ba
         JOIN bonus_questions bq ON bq.id = ba.question_id
         WHERE ba.user_id = $1 AND bq.match_id = m.id
       )
       ORDER BY m.kickoff_time ASC`,
      [req.user.id]
    );
    const predictions = result.rows.map(p => {
      const computedBonus = Number(p.computed_bonus_points || 0);
      if (p.id == null) {
        return {
          ...p,
          bonus_points_earned: computedBonus,
          points_earned: p.match_status === 'FINISHED' ? computedBonus : null,
        };
      }
      if (p.points_earned == null) {
        return {
          ...p,
          bonus_points_earned: computedBonus,
          points_earned: p.match_status === 'FINISHED' ? computedBonus : null,
        };
      }
      const scorePoints = Number(p.points_earned) - Number(p.bonus_points_earned || 0);
      return {
        ...p,
        bonus_points_earned: computedBonus,
        points_earned: scorePoints + computedBonus,
      };
    });
    res.json(predictions);
  } catch (err) {
    console.error('My predictions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/predictions/users — non-admin user list for compare dropdown
router.get('/users', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM users WHERE is_admin = FALSE ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/predictions/compare/:userId — all predictions for another user (for compare page)
router.get('/compare/:userId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.match_id, p.home_score, p.away_score, p.points_earned, p.bonus_points_earned,
              COALESCE(bonus.bonus_points, 0) AS computed_bonus_points,
              m.home_team, m.away_team, m.home_team_code, m.away_team_code,
              m.kickoff_time, m.stage, m.status AS match_status,
              m.home_score AS match_home_score, m.away_score AS match_away_score
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(
           CASE WHEN EXISTS (
             SELECT 1
             FROM unnest(
               CASE
                 WHEN COALESCE(array_length(bq.correct_answers, 1), 0) > 0 THEN bq.correct_answers
                 WHEN bq.correct_answer IS NOT NULL AND bq.correct_answer != '' THEN ARRAY[bq.correct_answer]::text[]
                 ELSE ARRAY[]::text[]
               END
             ) accepted(answer)
             WHERE LOWER(TRIM(accepted.answer)) = LOWER(TRIM(ba.answer))
           )
           THEN CASE bq.type WHEN 'player' THEN 5 WHEN 'yesno' THEN 2 ELSE 3 END
           ELSE 0 END
         ), 0) AS bonus_points
         FROM bonus_answers ba
         JOIN bonus_questions bq ON bq.id = ba.question_id
         WHERE ba.user_id = p.user_id AND bq.match_id = p.match_id
       ) bonus ON TRUE
       WHERE p.user_id = $1
       ORDER BY m.kickoff_time ASC`,
      [req.params.userId]
    );
    res.json(rows.map(p => {
      if (p.points_earned == null) return p;
      const scorePoints = Number(p.points_earned) - Number(p.bonus_points_earned || 0);
      return { ...p, points_earned: scorePoints + Number(p.computed_bonus_points || 0) };
    }));
  } catch (err) {
    console.error('Compare predictions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/predictions/match/:matchId — all users' predictions for a finished match
router.get('/match/:matchId', requireAuth, async (req, res) => {
  try {
    const { rows: matchRows } = await pool.query(
      'SELECT status FROM matches WHERE id = $1', [req.params.matchId]
    );
    if (!matchRows[0] || matchRows[0].status !== 'FINISHED') {
      return res.status(403).json({ error: 'Match not finished yet' });
    }
    const { rows } = await pool.query(
      `SELECT p.home_score, p.away_score, p.points_earned, p.bonus_points_earned,
               COALESCE(bonus.bonus_points, 0) AS computed_bonus_points,
               u.name AS user_name
       FROM predictions p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(
           CASE WHEN EXISTS (
             SELECT 1
             FROM unnest(
               CASE
                 WHEN COALESCE(array_length(bq.correct_answers, 1), 0) > 0 THEN bq.correct_answers
                 WHEN bq.correct_answer IS NOT NULL AND bq.correct_answer != '' THEN ARRAY[bq.correct_answer]::text[]
                 ELSE ARRAY[]::text[]
               END
             ) accepted(answer)
             WHERE LOWER(TRIM(accepted.answer)) = LOWER(TRIM(ba.answer))
           )
           THEN CASE bq.type WHEN 'player' THEN 5 WHEN 'yesno' THEN 2 ELSE 3 END
           ELSE 0 END
         ), 0) AS bonus_points
         FROM bonus_answers ba
         JOIN bonus_questions bq ON bq.id = ba.question_id
         WHERE ba.user_id = p.user_id AND bq.match_id = p.match_id
       ) bonus ON TRUE
       WHERE p.match_id = $1
       ORDER BY p.points_earned DESC NULLS LAST, u.name ASC`,
      [req.params.matchId]
    );
    res.json(rows.map(p => {
      if (p.points_earned == null) return p;
      const scorePoints = Number(p.points_earned) - Number(p.bonus_points_earned || 0);
      return { ...p, points_earned: scorePoints + Number(p.computed_bonus_points || 0) };
    }));
  } catch (err) {
    console.error('Match predictions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

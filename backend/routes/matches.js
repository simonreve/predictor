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
      `SELECT match_id, home_score, away_score, bonus_prediction_type, bonus_prediction_value,
              submitted_at, points_earned, score_raw_points, score_multiplier, bonus_points_earned,
              score_breakdown
       FROM predictions WHERE user_id = $1`,
      [req.user.id]
    );

    // Fetch bonus questions + this user's answers in one query
    const bonusResult = await pool.query(
      `SELECT bq.id, bq.match_id, bq.type, bq.question, bq.correct_answer, bq.correct_answers,
              ba.answer AS my_answer,
              CASE WHEN ba.id IS NOT NULL AND EXISTS (
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
              ELSE 0 END AS my_points
       FROM bonus_questions bq
       LEFT JOIN bonus_answers ba ON ba.question_id = bq.id AND ba.user_id = $1
       ORDER BY bq.match_id, bq.created_at ASC`,
      [req.user.id]
    );

    // Build lookup maps
    const predMap = {};
    predsResult.rows.forEach(p => { predMap[p.match_id] = p; });

    const bonusMap = {};
    const bonusPointsMap = {};
    bonusResult.rows.forEach(q => {
      if (!bonusMap[q.match_id]) bonusMap[q.match_id] = [];
      bonusMap[q.match_id].push(q);
      bonusPointsMap[q.match_id] = (bonusPointsMap[q.match_id] || 0) + Number(q.my_points || 0);
    });

    // Fetch scoring config so the frontend can display correct per-component point values
    const configResult = await pool.query('SELECT key, value FROM scoring_config');
    const cfgRaw = {};
    configResult.rows.forEach(r => { cfgRaw[r.key] = Number(r.value); });
    const scoringConfig = {
      pointsResult:     cfgRaw.points_result_correct ?? 7,
      pointsGoalDiff:   cfgRaw.points_goal_diff       ?? 3,
      pointsTotalGoals: cfgRaw.points_total_goals     ?? 3,
    };

    // Attach prediction + bonus questions to each match
    const matches = matchesResult.rows.map(m => {
      const storedPrediction = predMap[m.id] || null;
      const computedBonusPoints = bonusPointsMap[m.id] || 0;
      let prediction = storedPrediction;

      if (storedPrediction?.points_earned != null) {
        const scorePoints = Number(storedPrediction.points_earned) - Number(storedPrediction.bonus_points_earned || 0);
        prediction = {
          ...storedPrediction,
          bonus_points_earned: computedBonusPoints,
          points_earned: scorePoints + computedBonusPoints,
        };
      } else if (storedPrediction && m.status === 'FINISHED') {
        prediction = {
          ...storedPrediction,
          bonus_points_earned: computedBonusPoints,
          points_earned: computedBonusPoints,
        };
      }

      return {
        ...m,
        my_prediction: prediction,
        my_bonus_points: computedBonusPoints,
        bonus_questions: bonusMap[m.id] || [],
      };
    });

    res.json({ matches, scoringConfig });
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

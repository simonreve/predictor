// Leaderboard route: returns all users ranked by total points
// GET /api/leaderboard — sorted by total points descending

const express = require('express');
const pool = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/leaderboard
// Returns each user's name, total points, and number of correct predictions
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH last_match AS (
         SELECT id, home_team, away_team
         FROM matches
         WHERE status = 'FINISHED' AND home_score IS NOT NULL
         ORDER BY kickoff_time DESC
         LIMIT 1
       )
       SELECT
         u.id,
         u.name,
         COALESCE(SUM(p.points_earned), 0)
           + COALESCE((
               SELECT SUM(ba.points_earned)
               FROM bonus_answers ba
               WHERE ba.user_id = u.id AND ba.points_earned IS NOT NULL
             ), 0) AS total_points,
         COUNT(CASE WHEN p.points_earned > 0 THEN 1 END) AS correct_predictions,
         COUNT(p.id) AS total_predictions,
         (SELECT COUNT(*) FROM bonus_answers ba2
          WHERE ba2.user_id = u.id AND ba2.points_earned > 0) AS bonus_correct,
         lmp.points_earned AS last_match_points,
         lm.home_team      AS last_match_home,
         lm.away_team      AS last_match_away
       FROM users u
       LEFT JOIN (SELECT * FROM last_match) lm ON TRUE
       LEFT JOIN predictions p   ON p.user_id  = u.id
       LEFT JOIN predictions lmp ON lmp.user_id = u.id AND lmp.match_id = lm.id
       WHERE u.is_admin = FALSE
       GROUP BY u.id, u.name, lmp.points_earned, lm.home_team, lm.away_team
       ORDER BY total_points DESC, u.name ASC`
    );

    // Add rank numbers (handle ties: same points = same rank)
    let rank = 1;
    let prevPoints = null;
    const rows = result.rows.map((row, i) => {
      if (prevPoints !== null && parseFloat(row.total_points) < parseFloat(prevPoints)) {
        rank = i + 1;
      }
      prevPoints = row.total_points;
      return { ...row, rank };
    });

    res.json(rows);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

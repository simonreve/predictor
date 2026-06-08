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
      `SELECT
         u.id,
         u.name,
         COALESCE(SUM(p.points_earned), 0)
           + COALESCE((
               SELECT SUM(ba.points_earned)
               FROM bonus_answers ba
               WHERE ba.user_id = u.id AND ba.points_earned IS NOT NULL
             ), 0) AS total_points,
         COUNT(CASE WHEN p.points_earned > 0 THEN 1 END) AS correct_predictions,
         COUNT(p.id) AS total_predictions
       FROM users u
       LEFT JOIN predictions p ON u.id = p.user_id
       WHERE u.is_admin = FALSE
       GROUP BY u.id, u.name
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

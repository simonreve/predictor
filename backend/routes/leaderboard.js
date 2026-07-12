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
       ), prediction_totals AS (
         SELECT
           p.user_id,
           COALESCE(SUM(COALESCE(p.points_earned, 0) - COALESCE(p.bonus_points_earned, 0)), 0) AS score_points,
           COUNT(CASE WHEN m.status = 'FINISHED'
                            AND SIGN(p.home_score - p.away_score) = SIGN(m.home_score - m.away_score)
                      THEN 1 END) AS correct_predictions,
           COUNT(p.id) AS total_predictions
         FROM predictions p
         JOIN matches m ON m.id = p.match_id
         GROUP BY p.user_id
       ), scored_bonus_answers AS (
         SELECT
           ba.user_id,
           bq.match_id,
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
           ELSE 0 END AS points
         FROM bonus_answers ba
         JOIN bonus_questions bq ON bq.id = ba.question_id
       ), bonus_totals AS (
         SELECT user_id,
                COALESCE(SUM(points), 0) AS bonus_points,
                COUNT(*) FILTER (WHERE points > 0) AS bonus_correct
         FROM scored_bonus_answers
         GROUP BY user_id
       ), last_bonus AS (
         SELECT sba.user_id, COALESCE(SUM(sba.points), 0) AS points
         FROM scored_bonus_answers sba
         JOIN last_match lm ON lm.id = sba.match_id
         GROUP BY sba.user_id
       )
       SELECT
         u.id,
         u.name,
         COALESCE(pt.score_points, 0) + COALESCE(bt.bonus_points, 0) AS total_points,
         COALESCE(pt.correct_predictions, 0) AS correct_predictions,
         COALESCE(pt.total_predictions, 0) AS total_predictions,
         COALESCE(bt.bonus_correct, 0) AS bonus_correct,
         CASE
           WHEN lmp.id IS NOT NULL OR lb.points > 0
           THEN COALESCE(lmp.points_earned, 0) - COALESCE(lmp.bonus_points_earned, 0) + COALESCE(lb.points, 0)
           ELSE NULL
         END AS last_match_points,
         lm.home_team      AS last_match_home,
         lm.away_team      AS last_match_away
       FROM users u
       LEFT JOIN (SELECT * FROM last_match) lm ON TRUE
       LEFT JOIN prediction_totals pt ON pt.user_id = u.id
       LEFT JOIN bonus_totals bt ON bt.user_id = u.id
       LEFT JOIN last_bonus lb ON lb.user_id = u.id
       LEFT JOIN predictions lmp ON lmp.user_id = u.id AND lmp.match_id = lm.id
       WHERE u.is_admin = FALSE
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

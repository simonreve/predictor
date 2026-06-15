// Scoring logic — isolated here so it's easy to understand and modify
// Formula: total = (raw_score_points × rarity_multiplier) + bonus_points
//   raw_score_points = points_result_correct + points_goal_diff + points_total_goals (if applicable)
//   rarity_multiplier = 1 + (1 - same_result_predictions / total_predictions)
//   bonus_points = sum of correct bonus answers for this user on this match

const pool = require('./db/index');

function getResultCategory(homeScore, awayScore) {
  return Math.sign(homeScore - awayScore); // 1 = home win, 0 = draw, -1 = away win
}

// Load point values from scoring_config, falling back to defaults if missing
async function loadScoringConfig() {
  try {
    const { rows } = await pool.query('SELECT key, value FROM scoring_config');
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = Number(r.value); });
    return {
      pointsResult:     cfg.points_result_correct ?? 5,
      pointsGoalDiff:   cfg.points_goal_diff       ?? 3,
      pointsTotalGoals: cfg.points_total_goals     ?? 3,
    };
  } catch {
    return { pointsResult: 5, pointsGoalDiff: 3, pointsTotalGoals: 3 };
  }
}

// Calculate score-only points (before bonus) for one prediction
function calculateScorePoints(prediction, result, totalPreds, sameResultPreds, cfg) {
  const predCat = getResultCategory(prediction.home_score, prediction.away_score);
  const realCat = getResultCategory(result.home_score, result.away_score);

  if (predCat !== realCat) return 0;

  let raw = cfg.pointsResult;
  if (realCat !== 0 && (prediction.home_score - prediction.away_score) === (result.home_score - result.away_score)) {
    raw += cfg.pointsGoalDiff;
  }
  if ((prediction.home_score + prediction.away_score) === (result.home_score + result.away_score)) {
    raw += cfg.pointsTotalGoals;
  }

  const multiplier = totalPreds <= 0 ? 1 : 1 + (1 - sameResultPreds / totalPreds);
  return Math.round(raw * multiplier);
}

// Recalculate and save points for all predictions on one match.
// Total = score_points + bonus_points (bonus already stored in bonus_answers.points_earned)
async function recalculateMatchPoints(matchId, result) {
  const cfg = await loadScoringConfig();

  const { rows: predictions } = await pool.query(
    'SELECT * FROM predictions WHERE match_id = $1',
    [matchId]
  );
  if (predictions.length === 0) return 0;

  // Rarity: count predictions per result category
  const realCat = getResultCategory(result.home_score, result.away_score);
  const counts = { '-1': 0, '0': 0, '1': 0 };
  for (const p of predictions) {
    counts[String(getResultCategory(p.home_score, p.away_score))]++;
  }

  // Fetch bonus points per user for this match in one query
  const { rows: bonusRows } = await pool.query(`
    SELECT ba.user_id, COALESCE(SUM(ba.points_earned), 0) AS bonus_pts
    FROM bonus_answers ba
    JOIN bonus_questions bq ON bq.id = ba.question_id
    WHERE bq.match_id = $1 AND ba.points_earned IS NOT NULL
    GROUP BY ba.user_id
  `, [matchId]);
  const bonusMap = {};
  bonusRows.forEach(r => { bonusMap[r.user_id] = Number(r.bonus_pts); });

  for (const pred of predictions) {
    const predCat = getResultCategory(pred.home_score, pred.away_score);
    const scorePoints = predCat === realCat
      ? calculateScorePoints(pred, result, predictions.length, counts[String(predCat)], cfg)
      : 0;
    const bonusPoints = bonusMap[pred.user_id] ?? 0;
    await pool.query(
      'UPDATE predictions SET points_earned = $1 WHERE id = $2',
      [scorePoints + bonusPoints, pred.id]
    );
  }

  return predictions.length;
}

// Recalculate points for ALL finished matches — call this after a scoring config change.
async function recalculateAllPoints() {
  const { rows: matches } = await pool.query(
    `SELECT id, home_score, away_score FROM matches
     WHERE status = 'FINISHED' AND home_score IS NOT NULL AND away_score IS NOT NULL`
  );

  let predictionsUpdated = 0;
  for (const m of matches) {
    predictionsUpdated += await recalculateMatchPoints(
      m.id, { home_score: m.home_score, away_score: m.away_score }
    );
  }
  return { matchesProcessed: matches.length, predictionsUpdated };
}

module.exports = { calculateScorePoints, recalculateMatchPoints, recalculateAllPoints };

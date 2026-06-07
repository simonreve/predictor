// Scoring logic — isolated here so it's easy to understand and modify
// Called after a match finishes to calculate points for all predictions

const pool = require('./db/index');

const POINTS_RESULT_CORRECT = 5;
const POINTS_GOAL_DIFF_CORRECT = 3;
const POINTS_TOTAL_GOALS_CORRECT = 3;

function getResultCategory(homeScore, awayScore) {
  return Math.sign(homeScore - awayScore); // 1 = home win, 0 = draw, -1 = away win
}

/**
 * Calculate points for a single prediction.
 *
 * Formula:
 * raw_points =
 *   +5 if the predicted result category is correct
 *   +3 if the goal difference is correct and the match is not a draw
 *   +3 if the total number of goals is correct
 * rarity_multiplier = 1 + (1 - players_with_same_predicted_result / total_predictions_for_match)
 * final_points = raw_points × rarity_multiplier
 *
 * If the predicted result category is wrong, the prediction scores 0.
 *
 * @param {object} prediction - { home_score, away_score }
 * @param {object} result - { home_score, away_score } (actual match result)
 * @param {number} totalPreds - total number of predictions on this match
 * @param {number} sameResultPreds - predictions with the same result category
 * @returns {number} points earned (rounded to 2 decimal places)
 */
function calculatePoints(prediction, result, totalPreds, sameResultPreds) {
  const predHome = prediction.home_score;
  const predAway = prediction.away_score;
  const realHome = result.home_score;
  const realAway = result.away_score;

  const predCategory = getResultCategory(predHome, predAway);
  const realCategory = getResultCategory(realHome, realAway);

  if (predCategory !== realCategory) {
    return 0;
  }

  let rawPoints = POINTS_RESULT_CORRECT;

  const predGoalDiff = predHome - predAway;
  const realGoalDiff = realHome - realAway;
  const predTotalGoals = predHome + predAway;
  const realTotalGoals = realHome + realAway;

  if (realCategory !== 0 && predGoalDiff === realGoalDiff) {
    rawPoints += POINTS_GOAL_DIFF_CORRECT;
  }

  if (predTotalGoals === realTotalGoals) {
    rawPoints += POINTS_TOTAL_GOALS_CORRECT;
  }

  const rarityMultiplier = totalPreds <= 0
    ? 1
    : 1 + (1 - sameResultPreds / totalPreds);

  const points = rawPoints * rarityMultiplier;
  return Math.round(points);
}

/**
 * After a match finishes, recalculate and save points for all predictions on it.
 * @param {number} matchId - the internal DB match ID
 * @param {object} result  - { home_score, away_score }
 */
async function recalculateMatchPoints(matchId, result) {
  // Load all predictions for this match
  const predsResult = await pool.query(
    'SELECT * FROM predictions WHERE match_id = $1',
    [matchId]
  );
  const predictions = predsResult.rows;
  const totalPreds = predictions.length;

  if (totalPreds === 0) return 0;

  const realCategory = getResultCategory(result.home_score, result.away_score);
  const resultCounts = {
    '-1': 0,
    '0': 0,
    '1': 0,
  };

  for (const pred of predictions) {
    const category = getResultCategory(pred.home_score, pred.away_score);
    resultCounts[String(category)] += 1;
  }

  // Update each prediction's points
  let updatedCount = 0;
  for (const pred of predictions) {
    const predCategory = getResultCategory(pred.home_score, pred.away_score);

    if (predCategory !== realCategory) {
      // Wrong prediction
      await pool.query(
        'UPDATE predictions SET points_earned = 0 WHERE id = $1',
        [pred.id]
      );
      continue;
    }

    const points = calculatePoints(
      { home_score: pred.home_score, away_score: pred.away_score },
      result,
      totalPreds,
      resultCounts[String(predCategory)]
    );

    await pool.query(
      'UPDATE predictions SET points_earned = $1 WHERE id = $2',
      [points, pred.id]
    );
    updatedCount++;
  }

  return updatedCount;
}

module.exports = { calculatePoints, recalculateMatchPoints };

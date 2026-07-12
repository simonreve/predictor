// Scoring logic — isolated here so it's easy to understand and modify
// Formula: total = (raw_score_points × rarity_multiplier × stage_multiplier) + bonus_points

const pool = require('./db/index');

function getResultCategory(homeScore, awayScore) {
  return Math.sign(homeScore - awayScore); // 1 = home win, 0 = draw, -1 = away win
}

// Stage display name → scoring_config key
const STAGE_MULT_KEY = {
  'Group Stage':    'stage_mult_group_stage',
  'Round of 32':    'stage_mult_round_of_32',
  'Round of 16':    'stage_mult_round_of_16',
  'Quarter-Finals': 'stage_mult_quarter_finals',
  'Semi-Finals':    'stage_mult_semi_finals',
  'Final':          'stage_mult_final',
  'Third Place':    'stage_mult_third_place',
};

// Load all scoring config values from DB, falling back to defaults if missing
async function loadScoringConfig() {
  try {
    const { rows } = await pool.query('SELECT key, value FROM scoring_config');
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = Number(r.value); });
    return {
      pointsResult:     cfg.points_result_correct ?? 7,
      pointsGoalDiff:   cfg.points_goal_diff       ?? 3,
      pointsTotalGoals: cfg.points_total_goals     ?? 3,
      stageMults: {
        'Group Stage':    cfg.stage_mult_group_stage    ?? 1,
        'Round of 32':    cfg.stage_mult_round_of_32    ?? 1.25,
        'Round of 16':    cfg.stage_mult_round_of_16    ?? 1.5,
        'Quarter-Finals': cfg.stage_mult_quarter_finals ?? 2,
        'Semi-Finals':    cfg.stage_mult_semi_finals    ?? 3,
        'Final':          cfg.stage_mult_final          ?? 4,
        'Third Place':    cfg.stage_mult_third_place    ?? 2,
      },
    };
  } catch {
    return {
      pointsResult: 7, pointsGoalDiff: 3, pointsTotalGoals: 3,
      stageMults: {
        'Group Stage': 1, 'Round of 32': 1.25, 'Round of 16': 1.5,
        'Quarter-Finals': 2, 'Semi-Finals': 3, 'Final': 4, 'Third Place': 2,
      },
    };
  }
}

// Calculate score-only breakdown for one prediction.
// Returns { rawPoints, rarityMultiplier, stageMultiplier, scorePoints, breakdown }
function calculateScoreBreakdown(prediction, result, totalPreds, sameResultPreds, cfg, stageMultiplier = 1) {
  const predCat = getResultCategory(prediction.home_score, prediction.away_score);
  const realCat = getResultCategory(result.home_score, result.away_score);

  const zeroed = { result_points: 0, goal_diff_points: 0, total_goals_points: 0, stage_multiplier: stageMultiplier };
  if (predCat !== realCat) return { rawPoints: 0, rarityMultiplier: null, stageMultiplier, scorePoints: 0, breakdown: zeroed };

  const resultPoints   = cfg.pointsResult;
  const goalDiffPoints = (prediction.home_score - prediction.away_score) === (result.home_score - result.away_score)
    ? cfg.pointsGoalDiff : 0;
  const totalGoalsPoints = (prediction.home_score + prediction.away_score) === (result.home_score + result.away_score)
    ? cfg.pointsTotalGoals : 0;

  const rawPoints = resultPoints + goalDiffPoints + totalGoalsPoints;
  const rarityMultiplier = totalPreds <= 0 ? 1 : 1 + (1 - sameResultPreds / totalPreds);
  const scorePoints = Math.round(rawPoints * rarityMultiplier * stageMultiplier);

  return {
    rawPoints, rarityMultiplier, stageMultiplier, scorePoints,
    breakdown: { result_points: resultPoints, goal_diff_points: goalDiffPoints, total_goals_points: totalGoalsPoints, stage_multiplier: stageMultiplier },
  };
}

// Recalculate and save points for all predictions on one match.
// result = { home_score, away_score, stage? }
async function recalculateMatchPoints(matchId, result) {
  const cfg = await loadScoringConfig();
  const stage = result.stage || 'Group Stage';
  const stageMultiplier = cfg.stageMults[stage] ?? 1;

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

  // Derive bonus points from accepted answers instead of trusting the stored
  // points_earned value. This counts every question and also repairs legacy
  // answers that received a correct_answer without being graded afterwards.
  const { rows: bonusRows } = await pool.query(`
    SELECT ba.user_id,
           COALESCE(SUM(
             CASE WHEN
               EXISTS (
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
           ), 0) AS bonus_pts
    FROM bonus_answers ba
    JOIN bonus_questions bq ON bq.id = ba.question_id
    WHERE bq.match_id = $1
    GROUP BY ba.user_id
  `, [matchId]);
  const bonusMap = {};
  bonusRows.forEach(r => { bonusMap[r.user_id] = Number(r.bonus_pts); });

  const wrongResult = {
    rawPoints: 0, rarityMultiplier: null, stageMultiplier, scorePoints: 0,
    breakdown: { result_points: 0, goal_diff_points: 0, total_goals_points: 0, stage_multiplier: stageMultiplier },
  };

  for (const pred of predictions) {
    const predCat = getResultCategory(pred.home_score, pred.away_score);
    const { rawPoints, rarityMultiplier, scorePoints, breakdown } = predCat === realCat
      ? calculateScoreBreakdown(pred, result, predictions.length, counts[String(predCat)], cfg, stageMultiplier)
      : wrongResult;
    const bonusPoints = bonusMap[pred.user_id] ?? 0;
    await pool.query(
      `UPDATE predictions
       SET points_earned       = $1,
           score_raw_points    = $2,
           score_multiplier    = $3,
           bonus_points_earned = $4,
           score_breakdown     = $5
       WHERE id = $6`,
      [scorePoints + bonusPoints, rawPoints, rarityMultiplier, bonusPoints, JSON.stringify(breakdown), pred.id]
    );
  }

  return predictions.length;
}

// Recalculate points for ALL finished matches — call this after a scoring config change.
async function recalculateAllPoints() {
  const { rows: matches } = await pool.query(
    `SELECT id, home_score, away_score, stage FROM matches
     WHERE status = 'FINISHED' AND home_score IS NOT NULL AND away_score IS NOT NULL`
  );

  let predictionsUpdated = 0;
  for (const m of matches) {
    predictionsUpdated += await recalculateMatchPoints(
      m.id, { home_score: m.home_score, away_score: m.away_score, stage: m.stage }
    );
  }
  return { matchesProcessed: matches.length, predictionsUpdated };
}

module.exports = { calculateScoreBreakdown, recalculateMatchPoints, recalculateAllPoints, STAGE_MULT_KEY };

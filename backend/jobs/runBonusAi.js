// runBonusAi.js — Auto-answer bonus questions via OpenAI, 1h after match ends
// Triggered by a cron job in index.js every 5 minutes.
// Only processes matches where:
//   - status = FINISHED
//   - finished_at < NOW() - 1 hour
//   - bonus_ai_triggered_at IS NULL (not already processed)
//   - at least one bonus question has no correct_answer

const pool = require('../db/index');

async function runBonusAi() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return; // silently skip if not configured

  // Find matches ready for AI processing
  const { rows: matches } = await pool.query(`
    SELECT m.id, m.home_team, m.away_team, m.home_score, m.away_score,
           m.stage, m.kickoff_time, m.finished_at
    FROM matches m
    WHERE m.status = 'FINISHED'
      AND m.finished_at IS NOT NULL
      AND m.finished_at < NOW() - INTERVAL '1 hour'
      AND m.bonus_ai_triggered_at IS NULL
      AND EXISTS (
        SELECT 1 FROM bonus_questions bq
        WHERE bq.match_id = m.id
          AND (bq.correct_answer IS NULL OR bq.correct_answer = '')
      )
  `);

  if (matches.length === 0) return;

  console.log(`[BonusAI] ${matches.length} match(es) to process`);

  for (const match of matches) {
    // Mark as triggered immediately to prevent double-runs even if GPT fails
    await pool.query(
      'UPDATE matches SET bonus_ai_triggered_at = NOW() WHERE id = $1',
      [match.id]
    );

    const { rows: questions } = await pool.query(`
      SELECT id, type, question
      FROM bonus_questions
      WHERE match_id = $1
        AND (correct_answer IS NULL OR correct_answer = '')
    `, [match.id]);

    if (questions.length === 0) continue;

    console.log(`[BonusAI] Processing ${match.home_team} vs ${match.away_team} (${questions.length} question(s))`);

    for (const q of questions) {
      try {
        const answer = await askGpt(apiKey, q, match);
        if (!answer) continue;

        await pool.query(
          'UPDATE bonus_questions SET correct_answer = $1 WHERE id = $2',
          [answer, q.id]
        );
        console.log(`[BonusAI]   ✓ "${q.question}" → ${answer}`);
      } catch (err) {
        console.error(`[BonusAI]   ✗ Question ${q.id} failed: ${err.message}`);
      }
    }
  }
}

async function askGpt(apiKey, question, match) {
  const fetch = require('node-fetch');

  const context =
    `Match: ${match.home_team} ${match.home_score} – ${match.away_score} ${match.away_team}\n` +
    `Stage: ${match.stage} | Date: ${String(match.kickoff_time).slice(0, 10)}`;

  let userPrompt;
  if (question.type === 'country') {
    userPrompt =
      `${context}\n\n` +
      `Question: ${question.question}\n\n` +
      `Reply with EXACTLY one of: home (= ${match.home_team}), away (= ${match.away_team}), none — no other text.`;
  } else {
    userPrompt =
      `${context}\n\n` +
      `Question: ${question.question}\n\n` +
      `Reply with the player's full name only, nothing else.`;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: 'You are a football expert answering bonus questions about World Cup 2026 matches. Be concise and accurate.',
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '';

  if (question.type === 'country') {
    const val = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (['home', 'away', 'none'].includes(val)) return val;
    // Try to extract from longer response
    if (raw.toLowerCase().includes('home')) return 'home';
    if (raw.toLowerCase().includes('away')) return 'away';
    if (raw.toLowerCase().includes('none') || raw.toLowerCase().includes('aucune')) return 'none';
    console.warn(`[BonusAI] Unexpected country answer: "${raw}"`);
    return null;
  }

  return raw || null;
}

module.exports = { runBonusAi };

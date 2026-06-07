// Standings routes
// GET /api/standings  — group stage table fetched from football-data.org (with DB fallback)
// GET /api/bracket    — knockout stage matches organised by round

const express = require('express');
const fetch = require('node-fetch');
const pool = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const COMPETITION_ID = 2000;

// Country name → ISO-2 code for flag display (mirrors syncScores.js)
const COUNTRY_CODE_MAP = {
  'Algeria': 'dz', 'Argentina': 'ar', 'Australia': 'au', 'Austria': 'at',
  'Bahrain': 'bh', 'Belgium': 'be', 'Bolivia': 'bo',
  'Bosnia-Herzegovina': 'ba', 'Brazil': 'br',
  'Cameroon': 'cm', 'Canada': 'ca', 'Chile': 'cl', 'Colombia': 'co',
  'Congo DR': 'cd', 'Costa Rica': 'cr', 'Croatia': 'hr', 'Czechia': 'cz',
  'Denmark': 'dk',
  'Ecuador': 'ec', 'Egypt': 'eg', 'El Salvador': 'sv', 'England': 'gb-eng',
  'France': 'fr',
  'Georgia': 'ge', 'Germany': 'de', 'Ghana': 'gh', 'Guatemala': 'gt',
  'Honduras': 'hn', 'Hungary': 'hu',
  'Indonesia': 'id', 'Iran': 'ir', 'Iraq': 'iq', 'Ivory Coast': 'ci',
  'Jamaica': 'jm', 'Japan': 'jp', 'Jordan': 'jo',
  'Kenya': 'ke', 'Kuwait': 'kw',
  'Libya': 'ly',
  'Mali': 'ml', 'Mexico': 'mx', 'Morocco': 'ma',
  'Netherlands': 'nl', 'New Zealand': 'nz', 'Nigeria': 'ng',
  'Oman': 'om',
  'Panama': 'pa', 'Paraguay': 'py', 'Peru': 'pe', 'Poland': 'pl', 'Portugal': 'pt',
  'Qatar': 'qa', 'Romania': 'ro',
  'Saudi Arabia': 'sa', 'Scotland': 'gb-sct', 'Senegal': 'sn', 'Serbia': 'rs',
  'Slovakia': 'sk', 'Slovenia': 'si', 'South Africa': 'za', 'South Korea': 'kr',
  'Spain': 'es', 'Switzerland': 'ch',
  'Thailand': 'th', 'Trinidad and Tobago': 'tt', 'Tunisia': 'tn', 'Turkey': 'tr',
  'Ukraine': 'ua', 'United Arab Emirates': 'ae', 'United States': 'us', 'Uruguay': 'uy',
  'Uzbekistan': 'uz', 'Venezuela': 've', 'Vietnam': 'vn',
  'Wales': 'gb-wls', 'Zimbabwe': 'zw',
};

function getCode(name, tla) {
  if (!name || name === 'TBD') return null;
  if (COUNTRY_CODE_MAP[name]) return COUNTRY_CODE_MAP[name];
  if (tla) return tla.slice(0, 2).toLowerCase();
  return name.slice(0, 2).toLowerCase();
}

// Simple 5-minute in-memory cache to avoid hitting API rate limits
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

// GET /api/standings
// Tries football-data.org standings API first, falls back to computing from our DB.
router.get('/', requireAuth, async (req, res) => {
  try {
    // Serve from cache if fresh
    if (_cache && Date.now() - _cacheAt < CACHE_MS) {
      return res.json(_cache);
    }

    const apiKey = process.env.FOOTBALL_API_KEY;

    if (apiKey) {
      try {
        const response = await fetch(
          `https://api.football-data.org/v4/competitions/${COMPETITION_ID}/standings`,
          { headers: { 'X-Auth-Token': apiKey } }
        );

        if (response.ok) {
          const data = await response.json();
          const groups = {};

          for (const standing of data.standings || []) {
            // Only use TOTAL type (not home/away splits)
            if (standing.type !== 'TOTAL') continue;
            const key = standing.group; // "GROUP_A", "GROUP_B", …
            if (!key) continue;

            groups[key] = standing.table.map(entry => ({
              team:           entry.team.name,
              team_code:      getCode(entry.team.name, entry.team.tla),
              played:         entry.playedGames,
              won:            entry.won,
              drawn:          entry.draw,
              lost:           entry.lost,
              goals_for:      entry.goalsFor,
              goals_against:  entry.goalsAgainst,
              goal_diff:      entry.goalDifference,
              points:         entry.points,
            }));
          }

          const result = { groups, source: 'api' };
          _cache = result;
          _cacheAt = Date.now();
          return res.json(result);
        }

        console.warn('Standings API returned', response.status, '— falling back to DB');
      } catch (fetchErr) {
        console.warn('Standings API fetch failed:', fetchErr.message, '— falling back to DB');
      }
    }

    // --- DB fallback: compute standings from our matches table ---
    const { rows } = await pool.query(`
      WITH team_rows AS (
        SELECT home_team AS team, home_team_code AS team_code, group_name,
               status, home_score AS gf, away_score AS ga
        FROM matches WHERE stage = 'Group Stage' AND group_name IS NOT NULL
        UNION ALL
        SELECT away_team AS team, away_team_code AS team_code, group_name,
               status, away_score AS gf, home_score AS ga
        FROM matches WHERE stage = 'Group Stage' AND group_name IS NOT NULL
      )
      SELECT
        group_name,
        team,
        MAX(team_code) AS team_code,
        COUNT(CASE WHEN status = 'FINISHED' THEN 1 END)::int                                AS played,
        COUNT(CASE WHEN status = 'FINISHED' AND gf > ga THEN 1 END)::int                   AS won,
        COUNT(CASE WHEN status = 'FINISHED' AND gf = ga THEN 1 END)::int                   AS drawn,
        COUNT(CASE WHEN status = 'FINISHED' AND gf < ga THEN 1 END)::int                   AS lost,
        COALESCE(SUM(CASE WHEN status='FINISHED' THEN gf END),0)::int                       AS goals_for,
        COALESCE(SUM(CASE WHEN status='FINISHED' THEN ga END),0)::int                       AS goals_against,
        (COALESCE(SUM(CASE WHEN status='FINISHED' THEN gf END),0) -
         COALESCE(SUM(CASE WHEN status='FINISHED' THEN ga END),0))::int                     AS goal_diff,
        COALESCE(SUM(
          CASE WHEN status='FINISHED' AND gf>ga THEN 3
               WHEN status='FINISHED' AND gf=ga THEN 1
               ELSE 0 END),0)::int AS points
      FROM team_rows
      GROUP BY group_name, team
      ORDER BY group_name, points DESC, goal_diff DESC, goals_for DESC, team ASC
    `);

    const groups = {};
    for (const row of rows) {
      if (!groups[row.group_name]) groups[row.group_name] = [];
      groups[row.group_name].push(row);
    }

    const result = { groups, source: 'db' };
    _cache = result;
    _cacheAt = Date.now();
    res.json(result);

  } catch (err) {
    console.error('Standings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/standings/bracket
// Returns all knockout-stage matches grouped by round.
router.get('/bracket', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM matches
      WHERE stage != 'Group Stage'
      ORDER BY kickoff_time ASC
    `);

    const stages = {};
    for (const m of rows) {
      if (!stages[m.stage]) stages[m.stage] = [];
      stages[m.stage].push(m);
    }

    res.json({ stages });
  } catch (err) {
    console.error('Bracket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// Score sync job — fetches live/finished match results from football-data.org
// Runs automatically every 5 minutes via node-cron
// Can also be triggered manually via POST /api/admin/sync

// World Cup 2026 competition ID on football-data.org
const COMPETITION_ID = 2000;

const fetch = require('node-fetch');
const pool = require('../db/index');
const { recalculateMatchPoints } = require('../scoring');

// ── Bracket slot ordering ─────────────────────────────────────────────────────
// R32 visual slots 0-15 (top → bottom in the bracket display).
// Pairs feed R16: (0,1)→0  (2,3)→1  (4,5)→2  (6,7)→3  (8,9)→4  (10,11)→5  (12,13)→6  (14,15)→7
// Source: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
const R32_SLOT_BY_TEAM = {
  // Match 74 → slot 0  |  Match 77 → slot 1  →  R16 match 89
  'Germany': 0, 'Paraguay': 0,
  'France': 1, 'Sweden': 1,
  // Match 73 → slot 2  |  Match 75 → slot 3  →  R16 match 90
  'South Africa': 2, 'Canada': 2,
  'Netherlands': 3, 'Morocco': 3,
  // Match 83 → slot 4  |  Match 84 → slot 5  →  R16 match 93
  'Portugal': 4, 'Croatia': 4,
  'Spain': 5, 'Austria': 5,
  // Match 81 → slot 6  |  Match 82 → slot 7  →  R16 match 94
  'United States': 6, 'Bosnia-Herzegovina': 6, 'Bosnia and Herzegovina': 6,
  'Belgium': 7, 'Senegal': 7,
  // Match 76 → slot 8  |  Match 78 → slot 9  →  R16 match 91
  'Brazil': 8, 'Japan': 8,
  'Ivory Coast': 9, 'Côte d\'Ivoire': 9, 'Norway': 9,
  // Match 79 → slot 10  |  Match 80 → slot 11  →  R16 match 92
  'Mexico': 10, 'Ecuador': 10,
  'England': 11, 'Congo DR': 11, 'DR Congo': 11,
  // Match 86 → slot 12  |  Match 88 → slot 13  →  R16 match 95
  'Argentina': 12, 'Cape Verde': 12,
  'Australia': 13, 'Egypt': 13,
  // Match 85 → slot 14  |  Match 87 → slot 15  →  R16 match 96
  'Switzerland': 14, 'Algeria': 14,
  'Colombia': 15, 'Ghana': 15,
};

const PREV_STAGE = {
  'Round of 16':   'Round of 32',
  'Quarter-Finals': 'Round of 16',
  'Semi-Finals':    'Quarter-Finals',
  'Final':          'Semi-Finals',
};

// Returns the bracket_slot for a match, or null if it can't be determined yet.
// R32: looked up by team name. R16/QF/SF/Final: propagated as floor(prev_slot/2).
// Third Place always gets slot 0 (only one match).
async function computeBracketSlot(homeTeam, awayTeam, stage) {
  if (stage === 'Third Place') return 0;
  if (stage === 'Final') return 0;

  if (stage === 'Round of 32') {
    const slot = R32_SLOT_BY_TEAM[homeTeam] ?? R32_SLOT_BY_TEAM[awayTeam] ?? null;
    return slot;
  }

  const prevStage = PREV_STAGE[stage];
  if (!prevStage) return null;

  const knownTeams = [homeTeam, awayTeam].filter(team => team && team !== 'TBD');
  if (knownTeams.length === 0) return null;

  // Find which previous-round slot either known team came from.
  // This keeps future matches in the correct visual branch even when only one side is known.
  const { rows } = await pool.query(
    `SELECT bracket_slot FROM matches
     WHERE stage = $1 AND (home_team = ANY($2) OR away_team = ANY($2))
     AND bracket_slot IS NOT NULL
     ORDER BY bracket_slot ASC
     LIMIT 1`,
    [prevStage, knownTeams]
  );
  if (rows.length === 0) return null;
  return Math.floor(rows[0].bracket_slot / 2);
}

// Country name → ISO 3166-1 alpha-2 code mapping for flag display
// Used by flagcdn.com: https://flagcdn.com/w40/{code}.png
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
  'Qatar': 'qa',
  'Romania': 'ro',
  'Saudi Arabia': 'sa', 'Scotland': 'gb-sct', 'Senegal': 'sn', 'Serbia': 'rs',
  'Slovakia': 'sk', 'Slovenia': 'si', 'South Africa': 'za', 'South Korea': 'kr',
  'Spain': 'es', 'Switzerland': 'ch',
  'Thailand': 'th', 'Trinidad and Tobago': 'tt', 'Tunisia': 'tn', 'Turkey': 'tr',
  'Ukraine': 'ua', 'United Arab Emirates': 'ae', 'United States': 'us', 'Uruguay': 'uy',
  'Uzbekistan': 'uz',
  'Venezuela': 've', 'Vietnam': 'vn',
  'Wales': 'gb-wls',
  'Zimbabwe': 'zw',
};

// Use country map first, then fall back to the API's TLA (3-letter code) lowercased
function getCountryCode(teamName, tla) {
  if (!teamName || teamName === 'TBD') return null;
  if (COUNTRY_CODE_MAP[teamName]) return COUNTRY_CODE_MAP[teamName];
  // TLA like "FRA" → not a valid ISO-2 code, but better than a random slice
  // Try the first 2 chars of TLA as a last resort
  if (tla) return tla.slice(0, 2).toLowerCase();
  return teamName.slice(0, 2).toLowerCase();
}
/**
 * Main sync function — fetches matches from the API and updates the database.
 * Returns a summary { matchesUpdated, status }
 */
async function runSync() {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    const msg = 'FOOTBALL_API_KEY not set — skipping sync';
    console.warn(msg);
    await logSync('skipped', 0, msg);
    return { status: 'skipped', message: msg };
  }

  let matchesUpdated = 0;
  let errorMessage = null;

  try {
    // Fetch all matches for World Cup 2026 from football-data.org
    const url = `https://api.football-data.org/v4/competitions/${COMPETITION_ID}/matches`;
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': apiKey }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const matches = data.matches || [];

    for (const apiMatch of matches) {
      const homeTeam = apiMatch.homeTeam?.name || 'TBD';
      const awayTeam = apiMatch.awayTeam?.name || 'TBD';
      const homeTla  = apiMatch.homeTeam?.tla;
      const awayTla  = apiMatch.awayTeam?.tla;
      const kickoffTime = apiMatch.utcDate;
      const status = apiMatch.status; // SCHEDULED, TIMED, IN_PLAY, PAUSED, EXTRA_TIME, PENALTY_SHOOTOUT, FINISHED, etc.
      const stage = apiMatch.stage || apiMatch.round?.name || 'UNKNOWN';
      const groupName = apiMatch.group || null; // e.g. "GROUP_A", null for knockout matches
      if (stage === 'GROUP_STAGE' && !groupName) {
        console.warn(`No group for group-stage match #${apiMatch.id}: ${homeTeam} vs ${awayTeam}`);
      }

      // Map API stage names to friendly display names
      const stageDisplay = formatStage(stage);

      // Determine effective score for prediction purposes.
      // For PENALTY_SHOOTOUT: strip penalty kicks — use regularTime + extraTime (always a tie).
      // For EXTRA_TIME: fullTime includes ET goals and reflects the real winner, keep it.
      // For REGULAR: straightforward fullTime.
      const duration = apiMatch.score?.duration;
      let homeScore, awayScore;
      if (duration === 'PENALTY_SHOOTOUT' && apiMatch.score?.regularTime?.home != null) {
        const rtHome = apiMatch.score.regularTime.home;
        const rtAway = apiMatch.score.regularTime.away;
        const etHome = apiMatch.score.extraTime?.home ?? 0;
        const etAway = apiMatch.score.extraTime?.away ?? 0;
        homeScore = rtHome + etHome;
        awayScore = rtAway + etAway;
      } else {
        homeScore = apiMatch.score?.fullTime?.home ?? null;
        awayScore = apiMatch.score?.fullTime?.away ?? null;
      }
      const homeCode = getCountryCode(homeTeam, homeTla);
      const awayCode = getCountryCode(awayTeam, awayTla);

      // Check if this match already exists in our DB
      const existing = await pool.query(
        'SELECT * FROM matches WHERE api_match_id = $1',
        [apiMatch.id]
      );

      if (existing.rows.length === 0) {
        // Insert new match
        await pool.query(
          `INSERT INTO matches
             (api_match_id, home_team, away_team, home_team_code, away_team_code,
              kickoff_time, stage, status, home_score, away_score, group_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [apiMatch.id, homeTeam, awayTeam, homeCode, awayCode,
           kickoffTime, stageDisplay, status, homeScore, awayScore, groupName]
        );
        matchesUpdated++;
      } else {
        const existing_match = existing.rows[0];
        const wasFinished = existing_match.status === 'FINISHED';
        const isNowFinished = status === 'FINISHED';

        // Update the match — also refreshes team names for knockout matches that start as TBD
        await pool.query(
          `UPDATE matches SET
             home_team = $1, away_team = $2,
             status = $3, home_score = $4, away_score = $5,
             home_team_code = $6, away_team_code = $7, stage = $8,
             kickoff_time = $9, group_name = $10
           WHERE api_match_id = $11`,
          [homeTeam, awayTeam, status, homeScore, awayScore,
           homeCode, awayCode, stageDisplay, kickoffTime, groupName, apiMatch.id]
        );

        // If match just became FINISHED, record finish time and recalculate points
        if (!wasFinished && isNowFinished && homeScore !== null && awayScore !== null) {
          console.log(`Match finished: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`);
          await pool.query(
            'UPDATE matches SET finished_at = NOW() WHERE id = $1',
            [existing_match.id]
          );
          await recalculateMatchPoints(existing_match.id, { home_score: homeScore, away_score: awayScore, stage: stageDisplay });
          matchesUpdated++;
        }
      }

      // Set bracket_slot for knockout matches (R32 by team name; R16+ propagated from previous round)
      if (stageDisplay !== 'Group Stage') {
        const slot = await computeBracketSlot(homeTeam, awayTeam, stageDisplay);
        if (slot !== null) {
          await pool.query(
            'UPDATE matches SET bracket_slot = $1 WHERE api_match_id = $2 AND (bracket_slot IS DISTINCT FROM $1)',
            [slot, apiMatch.id]
          );
        }
      }
    }

    console.log(`Sync complete: ${matchesUpdated} matches updated`);
    await logSync('success', matchesUpdated);
    return { status: 'success', matchesUpdated };

  } catch (err) {
    errorMessage = err.message;
    console.error('Sync error:', err.message);
    await logSync('error', matchesUpdated, errorMessage);
    throw err;
  }
}

// Convert API stage names to human-friendly display names
// 2026 World Cup has 48 teams so includes a Round of 32 (LAST_32)
function formatStage(stage) {
  const map = {
    'GROUP_STAGE': 'Group Stage',
    'LAST_32':     'Round of 32',
    'LAST_16':     'Round of 16',
    'ROUND_OF_16': 'Round of 16',
    'QUARTER_FINALS': 'Quarter-Finals',
    'SEMI_FINALS': 'Semi-Finals',
    'THIRD_PLACE': 'Third Place',
    'FINAL':       'Final',
  };
  return map[stage] || stage;
}

// Write a record to sync_logs table
async function logSync(status, matchesUpdated, errorMessage = null) {
  try {
    await pool.query(
      `INSERT INTO sync_logs (status, matches_updated, error_message)
       VALUES ($1, $2, $3)`,
      [status, matchesUpdated, errorMessage]
    );
  } catch (err) {
    console.error('Failed to write sync log:', err.message);
  }
}

module.exports = { runSync };

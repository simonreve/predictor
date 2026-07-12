# Predictor — World Cup 2026

Football prediction game. Users submit score predictions and bonus questions before each match; points are awarded after the match finishes.

## Stack

- **Backend**: Node.js / Express, PostgreSQL (via `pg`), JWT auth, node-cron
- **Frontend**: React (Vite), plain CSS variables, no UI framework
- **Infra**: Docker Compose + Caddy (reverse proxy), production on Coolify

## Dev setup

```bash
# Start DB + backend (with nodemon auto-reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db backend

# In a separate terminal — native Vite dev server (HMR)
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

The `docker-compose.dev.yml` exposes `db:5432` and `backend:3001`. The Vite proxy forwards `/api` → `localhost:3001`.

## Key files

```
backend/
  index.js              — Express entry, runs migrations, mounts routes, starts cron
  scoring.js            — ALL scoring logic lives here (the only source of truth)
  db/migrations.sql     — Idempotent migrations (ALTER … IF NOT EXISTS, ON CONFLICT DO NOTHING)
  db/migrate.js         — Runs migrations.sql on startup
  routes/
    matches.js          — GET /api/matches  (returns { matches, scoringConfig })
    predictions.js      — POST /api/predictions
    admin.js            — Admin: users, scoring config, recalculate, sync, bonus questions
    bonus.js            — POST /api/bonus/answer
    leaderboard.js
    standings.js
  jobs/
    syncScores.js       — Fetches live results from football API, triggers recalculation
    runBonusAi.js       — Retained AI bonus grader (currently disabled in index.js)
  middleware/auth.js    — JWT requireAuth / requireAdmin

frontend/src/
  api.js                — All API calls in one place (no fetch scattered in components)
  components/
    MatchCard.jsx       — Main match display: prediction input + points breakdown
  pages/
    Matches.jsx         — Match list, grouped by stage/day
    Admin.jsx           — Admin panel
    MyPredictions.jsx
    Playoffs.jsx        — Has its own local MatchCard (different from the shared one)
```

## Scoring system

**Formula** (implemented in `backend/scoring.js`):
```
total = Math.round(score_raw_points × score_multiplier × stage_multiplier) + bonus_points_earned
```

**`score_raw_points`** = sum of components that were correct:
- `points_result_correct` (default 7) — correct win/draw/loss
- `points_goal_diff` (default 3) — exact goal margin (applies to draws too)
- `points_total_goals` (default 3) — exact total goals

**`score_multiplier`** = rarity bonus:
```
1 + (1 - sameResultPreds / totalPreds)
```
Ranges from 1.0 (everyone predicted this result) to ~2.0 (only this user did).

**`bonus_points_earned`** — sum of correctly-answered bonus questions for this match. Added flat after the multiplier (not multiplied).
Each question is counted separately, and leaderboard bonus points do not require a score prediction.

### Scoring config

Values are stored in the `scoring_config` DB table (key/value). Change them via the admin panel; hit **Recalculate** after any change to recompute all finished matches.

Default keys: `points_result_correct`, `points_goal_diff`, `points_total_goals`.

### Per-component breakdown

`score_breakdown` JSONB column on `predictions`:
```json
{ "result_points": 7, "goal_diff_points": 0, "total_goals_points": 3 }
```
This is written at scoring time by `recalculateMatchPoints`. The frontend reads it directly — never reconstructs point values from current config.

**After changing scoring config** → always run admin Recalculate to refresh `score_breakdown`.

## DB migrations

`backend/db/migrations.sql` is idempotent — safe to re-run. It runs automatically on every backend start via `runMigrations()`.

To add a column: `ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TYPE DEFAULT val;`

## API conventions

- `GET /api/matches` returns `{ matches: [...], scoringConfig: { pointsResult, pointsGoalDiff, pointsTotalGoals } }`
- Each match has `my_prediction` (null if not submitted) with fields:
  `points_earned`, `score_raw_points`, `score_multiplier`, `bonus_points_earned`, `score_breakdown`
- Each match also has `my_bonus_points`, including when the user submitted no score prediction.
- All routes require JWT (`requireAuth`); admin routes additionally require `requireAdmin`

## Frontend conventions

- All fetch calls go through `frontend/src/api.js` — add new endpoints there
- `MatchCard.jsx` is the only consumer of the shared MatchCard; `Playoffs.jsx` has its own separate local one
- `scoringConfig` is fetched once in `Matches.jsx` and passed as a prop to each `MatchCard` (available for future use, but the points breakdown itself uses `pred.score_breakdown`)

## Common tasks

**Recalculate all scores** (after config change or bug fix): Admin panel → Recalculate button, or `POST /api/admin/recalculate`

**Run migrations manually**:
```bash
docker exec world_cup_backend node db/migrate.js
```

**Create admin user**:
```bash
docker exec world_cup_backend node create-admin.js
```

**Check backend logs**:
```bash
docker logs world_cup_backend -f
```

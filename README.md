# World Cup 2026 Predictor

A private predictions game for friends and family. Everyone submits their score predictions before each match kicks off, and points are awarded automatically when results come in.

---

## Quick start (local development)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### 1. Copy the env file
```bash
cp .env.example .env
```
Edit `.env` and set:
- `FOOTBALL_API_KEY` — get a free key at [football-data.org](https://www.football-data.org/client/register)
- `AUTH_SECRET` — any long random string (e.g. run `openssl rand -hex 32`)

### 2. Start everything
```bash
docker compose up --build
```

The app will be available at **http://localhost**

The first time it starts, the backend will:
1. Create all database tables
2. Immediately sync matches from football-data.org (requires API key)
3. Schedule a sync every 5 minutes

### 3. Create your first admin account

Once the containers are running, exec into the backend to create the first admin:

```bash
docker compose exec backend node -e "
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
bcrypt.hash('yourpassword', 12).then(hash =>
  pool.query(\"INSERT INTO users (name, password_hash, is_admin) VALUES ('Admin', \$1, true)\", [hash])
).then(() => { console.log('Admin created'); pool.end(); });
"
```

After that, log in at http://localhost and use the Admin panel to create accounts for everyone else.

### 4. Make predictions

Each match card now supports two picks:
- the score prediction
- one bonus prediction, either a country or a player

For bonus predictions, choose the type in the match card and then select one of the two teams or type a player name.

---

## How to add a new user

1. Log in as admin
2. Go to **Admin → Users**
3. Enter their name and a password, click **Create user**
4. Share their name + password with them

---

## How to change the scoring formula

1. Log in as admin
2. Go to **Admin → Scoring**
3. Adjust the values and click **Save config**

Changes take effect the next time points are recalculated (when a match finishes).

The default formula is:
```
final_points = raw_points × rarity_multiplier

raw_points =
+5 if the predicted result category is correct
+3 if the goal difference is correct and the match is not a draw
+3 if the total number of goals is correct

rarity_multiplier = 1 + (1 - players_with_same_predicted_result / total_predictions_for_match)
```

The rarity multiplier is based on the predicted result category only, not the exact score. A very common result stays close to 1, while a rare result approaches 2.

---

## Deploy on a VPS with Coolify

1. Push this repo to GitHub (private repository is fine)

2. In Coolify, create a new **Docker Compose** application and point it at your repo

3. Set the environment variables in Coolify's environment settings:
   ```
   FOOTBALL_API_KEY=your_key_here
   AUTH_SECRET=your_random_secret_here
   NODE_ENV=production
   ```

4. Deploy — Coolify will build and start all three containers (db, backend, frontend)

5. Set up a domain in Coolify pointing to port 80 (the frontend nginx)

> **Note:** On Coolify, the `volumes` mount in docker-compose may need adjustment. For production, remove the `./backend:/app` volume mount from the backend service so it uses the built image instead of live-reloading from source.

---

## Project structure

```
/
├── frontend/          # React + Vite app
│   ├── src/
│   │   ├── pages/     # Login, Matches, Leaderboard, MyPredictions, Admin
│   │   ├── components/MatchCard.jsx
│   │   └── api.js     # All API calls in one file
├── backend/
│   ├── routes/        # auth, matches, predictions, leaderboard, admin
│   ├── db/            # migrations.sql, connection pool
│   ├── jobs/          # syncScores.js (cron job)
│   ├── scoring.js     # Point calculation logic
│   └── index.js       # Server entry point
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Troubleshooting

**Matches not showing up**
- Check that `FOOTBALL_API_KEY` is set correctly
- Go to Admin → Sync and click "Sync now"
- Check Admin → Sync logs for errors

**Points not calculating**
- Points are only calculated when a match status changes to `FINISHED`
- The free football-data.org API may have a delay of 15-30 minutes after a match ends

**"Invalid token" after a server restart**
- This happens if `AUTH_SECRET` changes between restarts
- Users just need to log in again

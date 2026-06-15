// Main entry point for the World Cup 2026 Predictor backend
// Starts Express server, runs DB migrations, and sets up the cron job

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const runMigrations = require('./db/migrate');
const { runSync } = require('./jobs/syncScores');
const { runBonusAi } = require('./jobs/runBonusAi');

const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/matches');
const predictionRoutes = require('./routes/predictions');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const standingsRoutes = require('./routes/standings');
const bonusRoutes     = require('./routes/bonus');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Allow requests from the frontend (Vite dev server or production build)
app.use(cors({
  origin: true, // allow all origins (fine since this is a private app)
  credentials: true
}));

app.use(express.json());

// Health check endpoint for Docker/Coolify
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/bonus',    bonusRoutes);

// Start everything
async function start() {
  // Run DB migrations first (creates tables if they don't exist)
  await runMigrations();

  // Start the Express server
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });

  // Run score sync every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running scheduled score sync...');
    try {
      await runSync();
    } catch (err) {
      console.error('Scheduled sync failed:', err.message);
    }
  });

  // Check every 5 minutes if any match finished 1h+ ago and has unanswered bonus questions
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runBonusAi();
    } catch (err) {
      console.error('Bonus AI job failed:', err.message);
    }
  });

  // Also run a sync on startup so we have fresh data immediately
  console.log('Running initial score sync...');
  runSync().catch(err => console.error('Initial sync failed:', err.message));
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

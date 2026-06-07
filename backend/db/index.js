// Database connection pool — imported by all route files
// Uses the pg library to connect to PostgreSQL via DATABASE_URL env variable

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test the connection on startup
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

module.exports = pool;

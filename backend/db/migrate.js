// Runs the SQL migration file on startup to create tables if they don't exist
// Safe to run multiple times — all statements use CREATE TABLE IF NOT EXISTS

const fs = require('fs');
const path = require('path');
const pool = require('./index');

async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✓ Database migrations ran successfully');
  } catch (err) {
    console.error('✗ Migration error:', err.message);
    throw err;
  }
}

module.exports = runMigrations;

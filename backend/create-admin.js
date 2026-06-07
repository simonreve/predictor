// One-time script to create the first admin user
// Run with: node create-admin.js
// Then delete this file or keep it for future use

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const name = process.argv[2] || 'Admin';
  const password = process.argv[3] || 'admin123';

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'INSERT INTO users (name, password_hash, is_admin) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET password_hash = $2, is_admin = $3 RETURNING id, name, is_admin',
    [name, hash, true]
  );
  console.log('Admin user ready:', result.rows[0]);
  pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });

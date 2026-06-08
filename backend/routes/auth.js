// Auth routes: login, register, and get current user info
// POST /api/auth/login     — returns a JWT token on success
// POST /api/auth/register  — creates an account and returns a JWT token
// GET  /api/auth/me        — returns the logged-in user's info

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db/index');
const { requireAuth, SECRET } = require('../middleware/auth');

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
// Body: { name, password }
router.post('/login', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE name = $1', [name]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid name or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid name or password' });
    }

    // Create a token that expires in 30 days
    const token = jwt.sign(
      { id: user.id, name: user.name, is_admin: user.is_admin },
      SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, is_admin: user.is_admin }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register
// Body: { name, password }
// Rate-limited to 10 attempts per IP per 15 minutes
router.post('/register', registerLimiter, async (req, res) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }

  const trimmedName = name.trim();

  if (trimmedName.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (trimmedName.length > 100) {
    return res.status(400).json({ error: 'Name must be 100 characters or fewer' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE name = $1', [trimmedName]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This name is already taken' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'INSERT INTO users (name, password_hash) VALUES ($1, $2) RETURNING id, name, is_admin',
      [trimmedName, password_hash]
    );
    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, name: user.name, is_admin: user.is_admin },
      SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, is_admin: user.is_admin }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — returns info about the currently logged-in user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, is_admin, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

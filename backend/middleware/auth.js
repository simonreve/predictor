// Authentication middleware
// Checks that the request has a valid JWT token in the Authorization header
// Usage: add requireAuth or requireAdmin to any route that needs protection

const jwt = require('jsonwebtoken');

const SECRET = process.env.AUTH_SECRET || 'changeme_in_production';

// Attach user info to req.user if token is valid
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Same as requireAuth but also checks is_admin flag
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin, SECRET };

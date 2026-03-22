'use strict';
const { verifyToken, isTokenRevoked } = require('../routes/auth');
const { getUserById } = require('../db/queries');

/**
 * Express middleware: validates Bearer JWT and loads the full user from DB.
 * Attaches `req.user` (DB row) and `req.tokenPayload` (JWT claims).
 * Rejects with 401 if token is missing, invalid, expired, revoked, or user no longer exists.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'TOKEN_REQUIRED', message: 'Authorization token required.' } });
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } });
  }

  // Check if token has been revoked (e.g. via logout)
  if (await isTokenRevoked(payload.jti)) {
    return res.status(401).json({ error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked.' } });
  }

  const user = await getUserById(payload.userId).catch(() => null);
  if (!user) {
    return res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
  }

  req.user = user;
  req.tokenPayload = payload;
  next();
}

module.exports = requireAuth;

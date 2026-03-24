'use strict';
const logger = require('../services/logger');
const { verifyToken, isTokenRevoked } = require('../routes/auth');
const { getUserById } = require('../db/queries');

/**
 * Express middleware: validates Bearer JWT and loads the full user from DB.
 * Attaches `req.user` (DB row) and `req.tokenPayload` (JWT claims).
 * Rejects with 401 if token is missing, invalid, expired, revoked, or user no longer exists.
 */
async function requireAuth(req, res, next) {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies.__wingman_sess) {
    token = req.cookies.__wingman_sess;
  }

  if (!token) {
    return res.status(401).json({ error: { code: 'TOKEN_REQUIRED', message: 'Authorization token required.' } });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } });
  }

  // Check if token has been revoked (e.g. via logout, account deletion, or session invalidation)
  if (await isTokenRevoked(payload.jti, payload.userId, payload.iat)) {
    return res.status(401).json({ error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked.' } });
  }

  const user = await getUserById(payload.userId).catch(err => { logger.error({ err: err.message }, '[auth] Failed to fetch user by ID'); return null; });
  if (!user) {
    return res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
  }

  req.user = user;
  req.tokenPayload = payload;
  next();
}

module.exports = requireAuth;

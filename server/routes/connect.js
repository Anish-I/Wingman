const express = require('express');
const jwt = require('jsonwebtoken');
const { initiateOAuth, handleOAuthCallback } = require('../services/zapier');
const { getUserZapierAccount, provisionUserAccount } = require('../services/zapier-account');
const { getUserById, addConnectedApp, removeConnectedApp, getConnectedApps } = require('../db/queries');
const { getUserSession } = require('../services/redis');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.WEB_URL || 'http://localhost:3000';

/**
 * Verify a JWT token from query param or Authorization header.
 * Returns the decoded payload (must contain userId).
 */
function verifyToken(req) {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    throw Object.assign(new Error('Missing authentication token'), { name: 'JsonWebTokenError' });
  }
  return jwt.verify(token, JWT_SECRET);
}

/**
 * GET /connect/initiate?app=google-calendar&token=JWT
 * Starts the OAuth flow for connecting an app via Zapier.
 * Redirects the user to the app's OAuth consent screen.
 */
router.get('/initiate', async (req, res) => {
  try {
    const { app: appSlug } = req.query;
    if (!appSlug) {
      return res.status(400).json({ error: 'Missing app parameter' });
    }

    const decoded = verifyToken(req);
    const userId = decoded.userId;

    // Ensure user has a Zapier account
    let zapAccount = await getUserZapierAccount(userId);
    if (!zapAccount) {
      const user = await getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const provisioned = await provisionUserAccount(userId, user.phone);
      zapAccount = { zapierAccountId: provisioned.zapierAccountId };
    }

    // Build callback URL with state for security
    const state = Buffer.from(JSON.stringify({
      userId,
      appSlug,
      token: req.query.token,
    })).toString('base64url');

    const redirectUri = `${req.protocol}://${req.get('host')}/connect/callback`;
    const authUrl = await initiateOAuth(zapAccount.zapierAccountId, appSlug, redirectUri);

    // Append state to the auth URL
    const separator = authUrl.includes('?') ? '&' : '?';
    res.redirect(`${authUrl}${separator}state=${state}`);
  } catch (err) {
    console.error('OAuth initiate error:', err);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Failed to start app connection' });
  }
});

/**
 * GET /connect/callback?code=&state=
 * Handles the OAuth callback from Zapier/app provider.
 * Exchanges the code, stores the connection, and redirects to success page.
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    // Decode state (base64url-encoded JSON)
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      // Fallback: state might be a session token from the old flow
      const session = await getUserSession(state);
      if (session) {
        stateData = { userId: session.userId, appSlug: req.query.app || session.appSlug };
      } else {
        return res.status(400).json({ error: 'Invalid state parameter' });
      }
    }

    const { userId, appSlug } = stateData;

    const zapAccount = await getUserZapierAccount(userId);
    if (!zapAccount) {
      return res.status(400).json({ error: 'Zapier account not provisioned' });
    }

    // Exchange the OAuth code via Zapier
    const authResult = await handleOAuthCallback(zapAccount.zapierAccountId, appSlug, code);

    // Store the connection in our DB
    const appDisplayName = appSlug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    await addConnectedApp(userId, appDisplayName, appSlug, authResult.id || null);

    // Redirect to success page
    res.redirect(`${APP_URL}/connect/success?app=${encodeURIComponent(appSlug)}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${APP_URL}/connect/error?message=${encodeURIComponent('Failed to connect app')}`);
  }
});

/**
 * DELETE /connect/:appSlug
 * Disconnects an app for the authenticated user.
 * Requires JWT in Authorization header or token query param.
 */
router.delete('/:appSlug', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const userId = decoded.userId;
    const { appSlug } = req.params;

    // Soft-delete from our DB
    const removed = await removeConnectedApp(userId, appSlug);
    if (!removed) {
      return res.status(404).json({ error: 'App connection not found' });
    }

    res.json({ success: true, message: `Disconnected ${appSlug}` });
  } catch (err) {
    console.error('Disconnect error:', err);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Failed to disconnect app' });
  }
});

/**
 * GET /connect/status/:token — returns user's connected apps for web page.
 * Kept for backwards compat with the connect page.
 */
router.get('/status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const payload = jwt.verify(token, JWT_SECRET);

    const apps = await getConnectedApps(payload.userId);

    res.json({
      success: true,
      apps: apps.map((a) => ({
        name: a.app_name,
        slug: a.app_slug,
        status: a.status,
        connectedAt: a.connected_at,
      })),
    });
  } catch (err) {
    console.error('Connect status error:', err);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    res.status(500).json({ error: 'Failed to fetch connection status.' });
  }
});

module.exports = router;

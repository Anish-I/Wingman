const crypto = require('crypto');
const { query } = require('../db/index');
const { getUserById, updateUserZapierAccount } = require('../db/queries');

const ZAPIER_EMBED_BASE = 'https://api.zapier.com/v1';
const PARTNER_TOKEN = process.env.ZAPIER_PARTNER_TOKEN;

/**
 * Make an authenticated request to the Zapier Embed Partner API.
 */
async function zapierPartnerRequest(path, options = {}) {
  const url = `${ZAPIER_EMBED_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${PARTNER_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zapier Partner API ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Provision a Zapier sub-account for a TextFlow user.
 * Creates the account via the Embed Partner API and stores the account ID in our DB.
 * Returns { zapierAccountId, token }.
 */
async function provisionUserAccount(userId, phone) {
  const externalId = `textflow_${userId}`;

  const data = await zapierPartnerRequest('/accounts', {
    method: 'POST',
    body: JSON.stringify({
      external_id: externalId,
      name: `TextFlow User ${phone}`,
      metadata: { phone, textflow_user_id: userId },
    }),
  });

  const zapierAccountId = data.id || data.account_id;
  const token = data.token || data.access_token || null;

  // Store the Zapier account ID in our users table
  await updateUserZapierAccount(userId, zapierAccountId);

  // Cache the token in our zapier_tokens table for later retrieval
  if (token) {
    await storeToken(zapierAccountId, token);
  }

  return { zapierAccountId, token };
}

/**
 * Get the Zapier account details for a user.
 * Returns user row with zapier_account_id, or null if not provisioned.
 */
async function getUserZapierAccount(userId) {
  const user = await getUserById(userId);
  if (!user || !user.zapier_account_id) {
    return null;
  }

  return {
    userId: user.id,
    zapierAccountId: user.zapier_account_id,
    phone: user.phone,
  };
}

/**
 * Get a fresh OAuth token for a Zapier sub-account.
 * First checks our local cache, then refreshes from the Partner API if expired.
 */
async function getZapierToken(zapierAccountId) {
  // Check local token cache
  const cached = await getCachedToken(zapierAccountId);
  if (cached && cached.expires_at > Date.now()) {
    return cached.token;
  }

  // Refresh from Partner API
  const data = await zapierPartnerRequest(`/accounts/${zapierAccountId}/token`, {
    method: 'POST',
  });

  const token = data.token || data.access_token;
  const expiresIn = data.expires_in || 3600;
  await storeToken(zapierAccountId, token, expiresIn);

  return token;
}

/**
 * Revoke and clean up a Zapier sub-account when a user is deleted.
 */
async function revokeUserAccount(zapierAccountId) {
  await zapierPartnerRequest(`/accounts/${zapierAccountId}`, {
    method: 'DELETE',
  });

  // Clean up local token cache
  await query(
    'DELETE FROM zapier_tokens WHERE zapier_account_id = $1',
    [zapierAccountId]
  );
}

// -- Internal token cache helpers --

async function storeToken(zapierAccountId, token, expiresInSeconds = 3600) {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  await query(
    `INSERT INTO zapier_tokens (zapier_account_id, token, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (zapier_account_id) DO UPDATE SET
       token = EXCLUDED.token,
       expires_at = EXCLUDED.expires_at`,
    [zapierAccountId, token, expiresAt]
  );
}

async function getCachedToken(zapierAccountId) {
  const result = await query(
    'SELECT token, expires_at FROM zapier_tokens WHERE zapier_account_id = $1',
    [zapierAccountId]
  );
  if (result.rows.length === 0) return null;
  return {
    token: result.rows[0].token,
    expires_at: new Date(result.rows[0].expires_at).getTime(),
  };
}

module.exports = {
  provisionUserAccount,
  getUserZapierAccount,
  getZapierToken,
  revokeUserAccount,
};

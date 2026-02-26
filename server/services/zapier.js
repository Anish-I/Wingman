const { getZapierToken } = require('./zapier-account');

const ZAPIER_API_BASE = 'https://api.zapier.com/v2';

/**
 * Make an authenticated request to the Zapier API on behalf of a user account.
 */
async function zapierRequest(zapierAccountId, path, options = {}) {
  const token = await getZapierToken(zapierAccountId);
  const url = `${ZAPIER_API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zapier API ${res.status} ${path}: ${body}`);
  }

  return res.json();
}

/**
 * Create a Zap from a template definition.
 * @param {string} zapierAccountId
 * @param {object} zapTemplate - { title, trigger, actions }
 * @returns {string} zapId
 */
async function createZap(zapierAccountId, zapTemplate) {
  const data = await zapierRequest(zapierAccountId, '/zaps', {
    method: 'POST',
    body: JSON.stringify(zapTemplate),
  });
  return data.id;
}

/**
 * Trigger a Zap by ID with input data.
 * @returns {object} execution result
 */
async function triggerZap(zapId, data) {
  // Zap triggers use the hooks endpoint
  const res = await fetch(`https://hooks.zapier.com/hooks/catch/${zapId}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zapier trigger failed ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Execute an action directly via the Zapier Actions API.
 * This is the primary method used by the tool dispatcher.
 * @param {string} zapierAccountId
 * @param {string} appSlug - e.g. 'google-calendar'
 * @param {string} actionSlug - e.g. 'find_events'
 * @param {object} inputData - action-specific input fields
 * @returns {object} action result
 */
async function executeAction(zapierAccountId, appSlug, actionSlug, inputData) {
  const data = await zapierRequest(zapierAccountId, '/actions/execute', {
    method: 'POST',
    body: JSON.stringify({
      app: appSlug,
      action: actionSlug,
      params: inputData,
    }),
  });
  return data.result || data;
}

/**
 * List available actions for an app.
 * @param {string} appSlug
 * @returns {Array} actions
 */
async function getAvailableActions(appSlug) {
  // Use partner token for app metadata (not user-specific)
  const token = process.env.ZAPIER_PARTNER_TOKEN;
  const url = `${ZAPIER_API_BASE}/apps/${appSlug}/actions`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zapier actions list failed ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.actions || data.results || data;
}

/**
 * List OAuth-connected apps for a user's Zapier account.
 * @returns {Array} connected apps
 */
async function getConnectedApps(zapierAccountId) {
  const data = await zapierRequest(zapierAccountId, '/authentications');
  return (data.results || data).map((auth) => ({
    app: auth.app || auth.app_slug,
    appTitle: auth.app_title || auth.title,
    status: auth.is_valid ? 'active' : 'expired',
    id: auth.id,
  }));
}

/**
 * Initiate OAuth flow for a user to connect an app via Zapier.
 * @param {string} zapierAccountId
 * @param {string} appSlug
 * @param {string} redirectUri - where to redirect after OAuth
 * @returns {string} authUrl - the OAuth URL to redirect the user to
 */
async function initiateOAuth(zapierAccountId, appSlug, redirectUri) {
  const data = await zapierRequest(zapierAccountId, '/authentications', {
    method: 'POST',
    body: JSON.stringify({
      app: appSlug,
      redirect_uri: redirectUri,
    }),
  });
  return data.authorize_url || data.url;
}

/**
 * Handle the OAuth callback: exchange the code and store the token in Zapier.
 * @param {string} zapierAccountId
 * @param {string} appSlug
 * @param {string} code - OAuth authorization code
 * @returns {object} authentication result
 */
async function handleOAuthCallback(zapierAccountId, appSlug, code) {
  const data = await zapierRequest(zapierAccountId, '/authentications/callback', {
    method: 'POST',
    body: JSON.stringify({
      app: appSlug,
      code,
    }),
  });
  return data;
}

module.exports = {
  createZap,
  triggerZap,
  executeAction,
  getAvailableActions,
  getConnectedApps,
  initiateOAuth,
  handleOAuthCallback,
};

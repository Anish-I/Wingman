const { OpenAIToolSet, Composio } = require('composio-core');
const { redis } = require('./redis');

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const TOOLS_CACHE_TTL = 30 * 60; // 30 minutes

// Apps Wingman exposes as tools. Composio silently skips apps the user hasn't connected yet.
const WINGMAN_APPS = [
  // Communication
  'gmail', 'slack', 'discord', 'discordbot', 'whatsapp', 'telegram',
  'microsoft_teams', 'outlook', 'zoom',
  // Calendar & Tasks
  'googlecalendar', 'googletasks', 'cal', 'calendly', 'todoist', 'asana',
  'trello', 'notion', 'linear', 'jira', 'clickup', 'monday',
  // Storage & Docs
  'googledrive', 'googledocs', 'googlesheets', 'googleslides',
  'dropbox', 'one_drive', 'box', 'airtable',
  // Dev & Code
  'github', 'gitlab', 'bitbucket',
  // CRM & Business
  'hubspot', 'salesforce', 'pipedrive', 'attio',
  // Finance
  'stripe', 'quickbooks', 'xero',
  // Social
  'twitter', 'linkedin', 'instagram', 'reddit',
  // Smart Home / IoT
  'triggercmd', 'sensibo',
  // Misc
  'spotify', 'youtube', 'perplexityai', 'tavily', 'serpapi',
];

/**
 * Get all available tools for a user.
 * Only tools for apps the user has connected will be returned.
 * Entity ID is our user's database ID (permanent, never changes).
 */
async function getTools(userId) {
  if (!COMPOSIO_API_KEY) return [];

  const cacheKey = `tools:${userId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const toolset = new OpenAIToolSet({ apiKey: COMPOSIO_API_KEY, entityId: String(userId) });
  const tools = await toolset.getTools({ apps: WINGMAN_APPS });
  const capped = tools.slice(0, 30);
  await redis.set(cacheKey, JSON.stringify(capped), 'EX', TOOLS_CACHE_TTL).catch(() => {});
  return capped;
}

async function invalidateToolsCache(userId) {
  await redis.del(`tools:${userId}`).catch(() => {});
}

/**
 * Execute a single tool call for a user.
 * Returns the parsed result object.
 */
async function executeTool(userId, toolCallBlock) {
  const toolset = new OpenAIToolSet({ apiKey: COMPOSIO_API_KEY, entityId: String(userId) });
  const raw = await toolset.executeToolCall({
    id: toolCallBlock.id,
    type: 'function',
    function: {
      name: toolCallBlock.name,
      arguments: JSON.stringify(toolCallBlock.input),
    },
  });
  try { return JSON.parse(raw); } catch { return { result: raw }; }
}

/**
 * Generate an OAuth connection URL for a user to connect an app.
 * The URL is single-use and opens in the user's browser.
 * Once authorized, Composio persists the session indefinitely.
 */
async function getConnectionLink(userId, appName) {
  const client = new Composio({ apiKey: COMPOSIO_API_KEY });
  const entity = await client.getEntity(String(userId));
  const conn = await entity.initiateConnection({ appName });
  return conn.redirectUrl;
}

/**
 * Check which of the requested apps the user has already connected.
 * Returns { connected: string[], missing: string[] }
 */
async function getConnectionStatus(userId, appNames) {
  try {
    const res = await fetch(
      `https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${userId}&pageSize=50`,
      { headers: { 'x-api-key': COMPOSIO_API_KEY } }
    );
    const data = await res.json();
    const connected = new Set(
      (data.items || [])
        .filter(c => c.status === 'ACTIVE')
        .map(c => c.appName.toLowerCase())
    );
    return {
      connected: appNames.filter(a => connected.has(a.toLowerCase())),
      missing: appNames.filter(a => !connected.has(a.toLowerCase())),
    };
  } catch {
    return { connected: [], missing: appNames };
  }
}

/**
 * Detect which app a Composio tool belongs to (e.g. GMAIL_SEND_EMAIL → gmail).
 */
function appFromToolName(toolName) {
  return toolName.split('_')[0].toLowerCase();
}

module.exports = { getTools, invalidateToolsCache, executeTool, getConnectionLink, getConnectionStatus, appFromToolName, WINGMAN_APPS };

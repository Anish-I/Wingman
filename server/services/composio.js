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
  await redis.set(cacheKey, JSON.stringify(tools), 'EX', TOOLS_CACHE_TTL).catch(() => {});
  return tools;
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

/**
 * Select the most relevant tools for a given message using keyword scoring.
 * Scores each tool by how many words from the message appear in its name/description.
 * Returns top `limit` tools (default 25). Any tool is reachable on the right message.
 */
function selectToolsForMessage(tools, message, limit = 25) {
  if (!tools || tools.length === 0) return [];
  if (tools.length <= limit) return tools;

  const words = new Set(
    (message || '').toLowerCase().match(/\w+/g) || []
  );
  // Remove common stop words that don't help with routing
  ['the', 'a', 'an', 'i', 'my', 'me', 'to', 'for', 'and', 'or', 'is', 'it', 'in', 'of', 'on', 'at', 'can', 'you', 'please'].forEach(w => words.delete(w));

  const scored = tools.map(tool => {
    const haystack = [
      tool.function?.name || '',
      tool.function?.description || '',
    ].join(' ').toLowerCase();
    const score = [...words].filter(w => haystack.includes(w)).length;
    return { tool, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // If nothing scored (pure conversational query like "what is 2+2?"), return no tools
  // so the LLM can answer directly without being confused by irrelevant tools.
  if (scored[0].score === 0) return [];
  return scored.slice(0, limit).map(s => s.tool);
}

module.exports = { getTools, invalidateToolsCache, executeTool, getConnectionLink, getConnectionStatus, appFromToolName, selectToolsForMessage, WINGMAN_APPS };

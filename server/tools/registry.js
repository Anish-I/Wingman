const { CALENDAR_TOOLS } = require('./calendar');
const { FINANCE_TOOLS } = require('./finance');
const { SHEETS_TOOLS } = require('./sheets');
const { TASKS_TOOLS } = require('./tasks');
const { NOTIFICATION_TOOLS } = require('./notifications');

// Maps app slugs to their tool arrays
const APP_TOOL_MAP = {
  'google-calendar': CALENDAR_TOOLS,
  'outlook-calendar': CALENDAR_TOOLS,
  'plaid': FINANCE_TOOLS,
  'rocket-money': [...FINANCE_TOOLS],
  'google-sheets': SHEETS_TOOLS,
  'airtable': SHEETS_TOOLS,
  'todoist': TASKS_TOOLS,
  'notion': [...TASKS_TOOLS, ...NOTIFICATION_TOOLS],
  'smart-home': NOTIFICATION_TOOLS,
};

/**
 * Given a user's connected apps, return a deduplicated array of Claude tool definitions.
 * @param {Array<{app_slug: string}>} connectedApps
 * @returns {Array} Deduplicated tools array
 */
function getToolsForUser(connectedApps) {
  const seen = new Set();
  const tools = [];

  for (const app of connectedApps) {
    const appTools = APP_TOOL_MAP[app.app_slug];
    if (!appTools) continue;

    for (const tool of appTools) {
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        tools.push(tool);
      }
    }
  }

  return tools;
}

module.exports = { getToolsForUser, APP_TOOL_MAP };

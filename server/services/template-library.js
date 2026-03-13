'use strict';
const { createTemplate, searchTemplates, getTemplateById, incrementTemplateUsage, createWorkflow } = require('../db/queries');

const STARTER_TEMPLATES = [
  {
    name: 'Recurring Reminder',
    description: 'Send yourself a reminder on a schedule',
    category: 'productivity',
    is_system: true,
    steps: [{ instruction: 'Send a reminder notification to the user with the configured message' }],
    variables: { message: 'Time to check in!', schedule: '0 9 * * *' },
    system_prompt: 'You are a reminder workflow. When triggered, send the user the reminder message using NOTIFY_USER. Keep it brief.',
  },
  {
    name: 'Discord Message',
    description: 'Send a message to a Discord channel on a schedule or trigger',
    category: 'messaging',
    is_system: true,
    steps: [{ instruction: 'Send the configured message to the specified Discord channel' }],
    variables: { channel: '', message: '' },
    system_prompt: 'You are a Discord messaging workflow. Send the configured message to the specified Discord channel using Discord tools.',
  },
  {
    name: 'Morning Briefing',
    description: 'Daily digest: calendar, tasks, weather summary',
    category: 'productivity',
    is_system: true,
    steps: [
      { instruction: 'Fetch today\'s calendar events' },
      { instruction: 'Fetch overdue or due-today tasks' },
      { instruction: 'Compose a brief morning summary' },
      { instruction: 'Send the briefing to the user via NOTIFY_USER' },
    ],
    variables: { schedule: '0 7 * * 1-5' },
    system_prompt: 'You are a morning briefing agent. Fetch calendar events and tasks for today, compose a concise summary (under 320 chars), and send it to the user via NOTIFY_USER. Be punchy — this is a quick daily glance.',
  },
  {
    name: 'Stock Price Watcher',
    description: 'Monitor a stock and notify when it crosses a threshold',
    category: 'finance',
    is_system: true,
    steps: [
      { instruction: 'Check the current price of the configured stock ticker' },
      { instruction: 'Compare against the threshold' },
      { instruction: 'If crossed, notify the user; otherwise, save the price to context' },
    ],
    variables: { ticker: 'AAPL', threshold: '200', direction: 'above' },
    system_prompt: 'You are a stock watcher. Check the price of the configured ticker. If it crosses the threshold in the specified direction, NOTIFY_USER. Always UPDATE_CONTEXT with the latest price for the next run.',
  },
  {
    name: 'Email Campaign Drip',
    description: 'Send a series of emails with human approval between each',
    category: 'marketing',
    is_system: true,
    steps: [
      { instruction: 'Draft the next email in the campaign sequence' },
      { instruction: 'Ask the user for approval via WAIT_FOR_REPLY' },
      { instruction: 'If approved, send the email; if not, stop' },
    ],
    variables: { recipient: '', subject_prefix: '', sequence_count: '3' },
    system_prompt: 'You are an email campaign agent. Draft each email, ask the user for approval using WAIT_FOR_REPLY, then send if approved. Track which email number you are on using UPDATE_CONTEXT. Stop if the user says no.',
  },
  {
    name: 'Smart Home Routine',
    description: 'Execute a series of smart home actions (lights, thermostat, etc.)',
    category: 'smart-home',
    is_system: true,
    steps: [
      { instruction: 'Execute the configured smart home actions in sequence' },
      { instruction: 'Confirm completion to the user' },
    ],
    variables: { routine: 'bedtime', actions: 'dim lights, lock doors, set thermostat to 68' },
    system_prompt: 'You are a smart home routine agent. Execute each action in the configured routine using available smart home tools. Notify the user when done.',
  },
];

async function seedTemplates() {
  for (const tmpl of STARTER_TEMPLATES) {
    // Check if already exists by name + is_system
    const existing = await searchTemplates(tmpl.name, null);
    const already = existing.find(e => e.name === tmpl.name && e.is_system);
    if (!already) {
      await createTemplate(tmpl);
      console.log(`[templates] Seeded: ${tmpl.name}`);
    }
  }
}

async function search(term, category) {
  return searchTemplates(term, category);
}

async function publish(userId, { name, description, category, steps, variables, system_prompt }) {
  return createTemplate({ name, description, category, steps, variables, system_prompt, author_user_id: userId, is_system: false });
}

async function instantiate(templateId, userId, overrides = {}) {
  const tmpl = await getTemplateById(templateId);
  if (!tmpl) throw new Error('Template not found');

  await incrementTemplateUsage(templateId);

  const variables = { ...tmpl.variables, ...overrides.variables };
  const workflow = await createWorkflow(userId, {
    name: overrides.name || tmpl.name,
    description: tmpl.description,
    trigger_type: overrides.trigger_type || 'manual',
    cron_expression: overrides.cron_expression || variables.schedule || null,
    trigger_config: null,
    actions: [], // Agent-based workflows don't use flat actions
  });

  // Update with v2 fields (steps, variables) via direct query
  const db = require('../db');
  await db.query(
    'UPDATE workflows SET steps = $1, variables = $2 WHERE id = $3',
    [JSON.stringify(tmpl.steps), JSON.stringify(variables), workflow.id]
  );

  return { ...workflow, steps: tmpl.steps, variables, system_prompt: tmpl.system_prompt };
}

module.exports = { seedTemplates, search, publish, instantiate, STARTER_TEMPLATES };

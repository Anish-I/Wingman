const { callLLM } = require('./llm');
const { createZap } = require('./zapier');
const { query } = require('../db/index');

const AUTOMATION_SYSTEM_PROMPT = `You are a natural language automation parser for TextFlow, an SMS-based AI assistant. The user describes an automation in plain English and you extract the structured components.

Return a JSON object with these fields:
- "trigger_type": one of "schedule", "webhook", "event"
- "cron": if schedule-based, the cron expression (e.g. "0 17 * * 5" for Friday 5pm). null otherwise.
- "webhook_source": if webhook-based, the source app (e.g. "github", "stripe"). null otherwise.
- "webhook_event": if webhook-based, the specific event (e.g. "build_failure", "payment_received"). null otherwise.
- "action": a short action identifier (e.g. "spending_summary", "format_and_sms", "task_reminder")
- "action_description": a brief human-readable description of what happens when triggered
- "summary": a user-friendly one-line summary of the automation

Examples:
- "Every Friday at 5pm, text me spending summary" → {"trigger_type":"schedule","cron":"0 17 * * 5","webhook_source":null,"webhook_event":null,"action":"spending_summary","action_description":"Fetch weekly spending and send SMS summary","summary":"Weekly spending summary every Friday at 5pm"}
- "When GitHub build fails, text me the error" → {"trigger_type":"webhook","cron":null,"webhook_source":"github","webhook_event":"build_failure","action":"format_and_sms","action_description":"Format build failure details and send SMS","summary":"SMS alert on GitHub build failure"}

Return ONLY valid JSON, no markdown or explanation.`;

/**
 * Parse a natural language automation description and create it.
 * @param {object} user - user record
 * @param {string} description - natural language automation description
 * @returns {string} confirmation message for the user
 */
async function parseAndCreateAutomation(user, description) {
  // Use Claude to extract automation structure
  const response = await callLLM(AUTOMATION_SYSTEM_PROMPT, [
    { role: 'user', content: description },
  ]);

  let parsed;
  try {
    // Strip markdown fences if present
    const text = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Could not understand that automation. Try rephrasing, e.g. "Every Monday at 9am, text me my tasks for the week."');
  }

  const { trigger_type, cron, webhook_source, webhook_event, action, action_description, summary } = parsed;

  // Build a Zapier Zap if the user has Zapier connected
  let zapId = null;
  if (user.zapier_account_id) {
    try {
      const zapTemplate = buildZapTemplate(parsed, user);
      zapId = await createZap(user.zapier_account_id, zapTemplate);
    } catch (err) {
      console.error('Failed to create Zap for automation:', err.message);
      // Continue without Zap — we can still store the rule
    }
  }

  // Save to automation_rules table
  await query(
    `INSERT INTO automation_rules (user_id, description, trigger_type, cron_expression, webhook_source, webhook_event, action, action_description, zapier_zap_id, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
     RETURNING id`,
    [user.id, description, trigger_type, cron || null, webhook_source || null, webhook_event || null, action, action_description, zapId]
  );

  return `Automation created: ${summary}. ${zapId ? "Connected to Zapier." : "I'll handle this internally."} Reply STOP to cancel anytime.`;
}

/**
 * Build a Zapier Zap template from parsed automation data.
 */
function buildZapTemplate(parsed, user) {
  const template = {
    title: `TextFlow: ${parsed.summary}`,
    steps: [],
  };

  // Trigger step
  if (parsed.trigger_type === 'schedule') {
    template.steps.push({
      app: 'schedule',
      action: 'every_day',
      params: { cron: parsed.cron },
    });
  } else if (parsed.trigger_type === 'webhook') {
    template.steps.push({
      app: parsed.webhook_source || 'webhook',
      action: parsed.webhook_event || 'catch_hook',
      params: {},
    });
  }

  // Action step — send SMS via TextFlow webhook
  template.steps.push({
    app: 'webhook',
    action: 'post',
    params: {
      url: `${process.env.BASE_URL || 'https://textflow.ai'}/api/webhooks/automation`,
      data: {
        userId: user.id,
        action: parsed.action,
      },
    },
  });

  return template;
}

/**
 * List active automations for a user.
 */
async function listAutomations(userId) {
  const result = await query(
    'SELECT id, description, trigger_type, action_description, active FROM automation_rules WHERE user_id = $1 AND active = true ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

/**
 * Deactivate an automation.
 */
async function cancelAutomation(userId, automationId) {
  const result = await query(
    'UPDATE automation_rules SET active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
    [automationId, userId]
  );
  return result.rows[0] || null;
}

module.exports = { parseAndCreateAutomation, listAutomations, cancelAutomation };

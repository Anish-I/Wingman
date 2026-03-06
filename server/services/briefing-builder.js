const { callLLM } = require('./llm');

const BRIEFING_SYSTEM_PROMPT = `You are TextFlow, an SMS-based personal AI assistant. Your job is to write a concise, friendly morning briefing that fits in a single SMS message (under 320 characters if possible, max 480).

Format:
Morning! Your {dayOfWeek}:
- {meetingCount} meetings (first at {time})
- {tasksDueCount} tasks due today
- Spend this week: ${spent} / ${budget}
Anything you need?

Rules:
- Be warm but concise. Every character counts in SMS.
- If a data section is missing, skip it gracefully — don't mention errors.
- Use bullet points (dash or bullet char) for readability.
- Include only the most important details.
- End with a short prompt inviting the user to reply.`;

/**
 * Build a morning briefing message using Claude.
 * @param {object} user - user record with name, preferences
 * @param {object|null} calendarData - calendar events for today
 * @param {object|null} tasksData - overdue/due-today tasks
 * @param {object|null} financeData - spending by category for the week
 * @returns {string} SMS-ready briefing message
 */
async function buildMorningBriefing(user, calendarData, tasksData, financeData) {
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const userName = user.name || 'there';

  const parts = [`Today is ${dayOfWeek}. The user's name is ${userName}.`];

  if (calendarData && calendarData.events && calendarData.events.length > 0) {
    const events = calendarData.events;
    parts.push(`Calendar: ${events.length} event(s) today. Events: ${JSON.stringify(events.slice(0, 5))}`);
  } else if (calendarData) {
    parts.push('Calendar: No events scheduled today.');
  } else {
    parts.push('Calendar: Data unavailable.');
  }

  if (tasksData && tasksData.tasks && tasksData.tasks.length > 0) {
    const tasks = tasksData.tasks;
    parts.push(`Tasks: ${tasks.length} overdue/due task(s). Tasks: ${JSON.stringify(tasks.slice(0, 5))}`);
  } else if (tasksData) {
    parts.push('Tasks: No overdue tasks.');
  } else {
    parts.push('Tasks: Data unavailable.');
  }

  if (financeData && financeData.spending_by_category) {
    const total = Object.values(financeData.spending_by_category).reduce((s, v) => s + v, 0);
    const budget = (user.preferences && user.preferences.weekly_budget) || null;
    const budgetStr = budget ? ` / $${budget}` : '';
    parts.push(`Weekly spend: $${total.toFixed(0)}${budgetStr}. Breakdown: ${JSON.stringify(financeData.spending_by_category)}`);
  } else {
    parts.push('Finance: Data unavailable.');
  }

  const userMessage = parts.join('\n');

  try {
    const response = await callLLM(BRIEFING_SYSTEM_PROMPT, [
      { role: 'user', content: userMessage },
    ]);
    return response.text || buildFallbackBriefing(userName, dayOfWeek, calendarData, tasksData, financeData);
  } catch (err) {
    console.error('LLM briefing generation failed:', err.message);
    return buildFallbackBriefing(userName, dayOfWeek, calendarData, tasksData, financeData);
  }
}

/**
 * Fallback briefing if Claude is unavailable.
 */
function buildFallbackBriefing(name, day, calendar, tasks, finance) {
  const lines = [`Morning, ${name}! Your ${day}:`];

  if (calendar && calendar.events) {
    const count = calendar.events.length;
    if (count > 0) {
      const first = calendar.events[0];
      const time = first.start || 'TBD';
      lines.push(`- ${count} meeting${count > 1 ? 's' : ''} (first at ${time})`);
    } else {
      lines.push('- No meetings today');
    }
  }

  if (tasks && tasks.tasks) {
    const count = tasks.tasks.length;
    lines.push(`- ${count} task${count !== 1 ? 's' : ''} due`);
  }

  if (finance && finance.spending_by_category) {
    const total = Object.values(finance.spending_by_category).reduce((s, v) => s + v, 0);
    lines.push(`- Spent $${total.toFixed(0)} this week`);
  }

  lines.push('Anything you need?');
  return lines.join('\n');
}

module.exports = { buildMorningBriefing };

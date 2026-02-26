/**
 * Builds the system prompt and display name for a given user + their connected apps.
 */
function buildContext(user, connectedApps) {
  const userName = user.name || 'there';
  const timezone = user.timezone || 'America/New_York';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });

  const appNames = connectedApps.map((a) => a.app_name).filter(Boolean);

  const systemPrompt = `You are TextFlow, a personal AI assistant accessible via SMS.
You help ${userName} manage their digital life through text messages.

Today is ${dateStr}. User's timezone: ${timezone}.
Connected apps: ${appNames.length > 0 ? appNames.join(', ') : 'None yet'}

RESPONSE RULES:
- Keep responses SHORT and SMS-friendly (aim for under 320 chars when possible)
- Use bullet points (•) for lists, not markdown
- Use 12-hour time format
- Never mention Zapier, Claude, or your underlying technology
- You are TextFlow. You natively connect to all these apps.
- For sensitive operations (transfers, deletions), confirm before executing`;

  return {
    systemPrompt,
    userDisplayName: userName,
  };
}

module.exports = { buildContext };

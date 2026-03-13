const { createReminder } = require('../db/queries');

function parseReminderTime(timeStr) {
  const now = new Date();

  // "in X minutes/hours"
  const inMatch = timeStr.match(/in\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?)/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    const ms = unit.startsWith('h') ? amount * 60 * 60 * 1000 : amount * 60 * 1000;
    return new Date(now.getTime() + ms);
  }

  // "tomorrow at Xam/pm"
  const tomorrowMatch = timeStr.match(/tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (tomorrowMatch) {
    let hour = parseInt(tomorrowMatch[1], 10);
    const mins = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
    const ampm = (tomorrowMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(hour, mins, 0, 0);
    return d;
  }

  // "at Xam/pm" (today or tomorrow if past)
  const atMatch = timeStr.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (atMatch) {
    let hour = parseInt(atMatch[1], 10);
    const mins = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
    const ampm = atMatch[3].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const d = new Date(now);
    d.setHours(hour, mins, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }

  return null;
}

function parseReminder(text) {
  // Match patterns like "remind me to X at/in Y"
  const match = text.match(/remind\s+me\s+(?:to\s+)?(.+?)\s+(at\s+\d.+|in\s+\d.+|tomorrow.+)$/i);
  if (!match) return null;

  const message = match[1].trim();
  const timeStr = match[2].trim();
  const fireAt = parseReminderTime(timeStr);

  if (!fireAt || !message) return null;
  return { message, fireAt };
}

async function handleReminder(user, text) {
  const parsed = parseReminder(text);
  if (!parsed) return null;

  await createReminder(user.id, parsed.message, parsed.fireAt);

  const h = parsed.fireAt.getHours();
  const m = parsed.fireAt.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  const timeFormatted = m > 0
    ? `${hr}:${String(m).padStart(2, '0')}${ampm}`
    : `${hr}${ampm}`;

  const isToday = parsed.fireAt.toDateString() === new Date().toDateString();
  const dayPart = isToday ? 'today' : 'tomorrow';

  return `Got it, I'll remind you to ${parsed.message} ${dayPart} at ${timeFormatted}.`;
}

module.exports = { handleReminder, parseReminder, parseReminderTime };

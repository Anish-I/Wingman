const { callLLM } = require('./llm');
const queries = require('../db/queries');

const EXTRACT_PROMPT = `You are a memory extraction system. Given a conversation, extract personal facts about the user.
Return ONLY valid JSON with these fields (omit any you can't determine):
{
  "name": "their name",
  "location": "city/state/country",
  "job": "occupation or role",
  "preferences": ["list of preferences, e.g. brief replies, morning person"],
  "people": ["names of people they mention with context, e.g. wife Sarah, boss Mike"],
  "habits": ["recurring behaviors or routines"],
  "interests": ["hobbies, topics they care about"],
  "other": ["any other notable facts"]
}
Only include facts explicitly stated or strongly implied. Do not guess. Return {} if nothing is extractable.`;

async function extractAndSaveMemory(user, messages) {
  try {
    const recent = messages.slice(-10);
    const conversationText = recent
      .map(m => {
        const content = typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
            : '';
        return `${m.role}: ${content}`;
      })
      .filter(line => line.length > 6)
      .join('\n');

    if (!conversationText || conversationText.length < 20) return;

    const response = await callLLM(
      EXTRACT_PROMPT,
      [{ role: 'user', content: conversationText }],
      null
    );

    if (!response.text) return;

    let extracted;
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      extracted = JSON.parse(jsonMatch[0]);
    } catch {
      return;
    }

    if (Object.keys(extracted).length === 0) return;

    const existing = user.preferences?.memory || {};
    const merged = { ...existing };

    if (extracted.name) merged.name = extracted.name;
    if (extracted.location) merged.location = extracted.location;
    if (extracted.job) merged.job = extracted.job;

    for (const arrayKey of ['preferences', 'people', 'habits', 'interests', 'other']) {
      if (Array.isArray(extracted[arrayKey]) && extracted[arrayKey].length > 0) {
        const existingArr = merged[arrayKey] || [];
        const combined = [...new Set([...existingArr, ...extracted[arrayKey]])];
        merged[arrayKey] = combined.slice(-20);
      }
    }

    await queries.updateUserPreferences(user.id, { memory: merged });
  } catch (err) {
    console.error('[memory] extraction failed:', err.message);
  }
}

function getMemoryContext(user) {
  const mem = user.preferences?.memory;
  if (!mem) return '';

  const parts = [];
  if (mem.name) parts.push(`Name: ${mem.name}`);
  if (mem.location) parts.push(`Location: ${mem.location}`);
  if (mem.job) parts.push(`Job: ${mem.job}`);
  if (mem.preferences?.length) parts.push(mem.preferences.join('. '));
  if (mem.people?.length) parts.push(`People: ${mem.people.join(', ')}`);
  if (mem.habits?.length) parts.push(`Habits: ${mem.habits.join(', ')}`);
  if (mem.interests?.length) parts.push(`Interests: ${mem.interests.join(', ')}`);
  if (mem.other?.length) parts.push(mem.other.join('. '));

  return parts.join('. ');
}

module.exports = { extractAndSaveMemory, getMemoryContext };

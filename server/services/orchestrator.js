const Redis = require('ioredis');
const { callLLM } = require('./llm');
const { buildContext } = require('./context');
const { getToolsForUser } = require('../tools/registry');
const { getConnectedApps } = require('../db/queries');
const { executeZapierTool } = require('./zapier-tools');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const HISTORY_KEY_PREFIX = 'conv:';
const MAX_HISTORY_MESSAGES = 20;
const HISTORY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_TOOL_ITERATIONS = 5;

const ONBOARDING_URL = process.env.ONBOARDING_URL || 'https://textflow.ai/connect';

const WELCOME_MESSAGE =
  `Welcome to TextFlow! I'm your personal AI assistant, right here in your texts.\n\n` +
  `To get started, connect your apps so I can help you:\n` +
  `${ONBOARDING_URL}\n\n` +
  `Once connected, just text me naturally — "What's on my calendar today?" or "Add milk to my grocery list."`;

const NO_APPS_MESSAGE =
  `You haven't connected any apps yet! Connect at least one so I can start helping:\n` +
  `${ONBOARDING_URL}\n\n` +
  `I work with Google Calendar, Todoist, Google Sheets, Plaid, and more.`;

/**
 * Load conversation history from Redis.
 */
async function loadHistory(userId) {
  const key = HISTORY_KEY_PREFIX + userId;
  const raw = await redis.get(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save conversation history to Redis with TTL.
 */
async function saveHistory(userId, messages) {
  const key = HISTORY_KEY_PREFIX + userId;
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  await redis.set(key, JSON.stringify(trimmed), 'EX', HISTORY_TTL_SECONDS);
}

/**
 * Main message processing engine.
 * Takes a user object and their SMS text, returns a response string.
 */
async function processMessage(user, messageText) {
  const history = await loadHistory(user.id);

  // Load connected apps (empty = no tools, but LLM still responds)
  const connectedApps = await getConnectedApps(user.id);

  // Build system prompt and tools
  const { systemPrompt } = buildContext(user, connectedApps);
  const tools = getToolsForUser(connectedApps);

  // Build working messages array
  const messages = [...history, { role: 'user', content: messageText }];

  let response;
  let iterations = 0;

  // Agentic loop — keep going until no tool calls or iteration cap hit
  while (iterations < MAX_TOOL_ITERATIONS) {
    response = await callLLM(systemPrompt, messages, tools);

    if (response.toolUseBlocks.length === 0) {
      break; // Got a text reply — done
    }

    // Append assistant message with all content blocks (text + tool_use)
    const assistantContent = [];
    if (response.text) {
      assistantContent.push({ type: 'text', text: response.text });
    }
    for (const block of response.toolUseBlocks) {
      assistantContent.push(block);
    }
    messages.push({ role: 'assistant', content: assistantContent });

    // Execute all tool calls and collect results
    const toolResults = [];
    for (const block of response.toolUseBlocks) {
      let result;
      try {
        result = await executeZapierTool(user, block.name, block.input);
      } catch (err) {
        console.error(`Tool execution failed [${block.name}]:`, err.message);
        result = { error: `Failed to execute ${block.name}: ${err.message}` };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    // Append tool results as user message
    messages.push({ role: 'user', content: toolResults });

    iterations++;
  }

  const finalText = response.text || "Done! Let me know if you need anything else.";

  // Save full messages (including tool call/result pairs) plus final assistant reply
  await saveHistory(user.id, [
    ...messages,
    { role: 'assistant', content: finalText },
  ]);

  return finalText;
}

module.exports = { processMessage };

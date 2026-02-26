const Redis = require('ioredis');
const { callClaude } = require('./claude');
const { buildContext } = require('./context');
const { getToolsForUser } = require('../tools/registry');
const { getConnectedApps } = require('../db/queries');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const HISTORY_KEY_PREFIX = 'conv:';
const MAX_HISTORY_MESSAGES = 20;
const HISTORY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

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
  // Keep only the most recent messages
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  await redis.set(key, JSON.stringify(trimmed), 'EX', HISTORY_TTL_SECONDS);
}

/**
 * Execute a single tool call via the Zapier tools service.
 * Dynamically imports to avoid circular dependencies.
 */
async function executeTool(user, toolName, toolInput) {
  try {
    const { executeZapierTool } = require('./zapier-tools');
    return await executeZapierTool(user, toolName, toolInput);
  } catch (err) {
    console.error(`Tool execution failed [${toolName}]:`, err.message);
    return { error: `Failed to execute ${toolName}: ${err.message}` };
  }
}

/**
 * Main message processing engine.
 * Takes a user object and their SMS text, returns a response string.
 */
async function processMessage(user, messageText) {
  // Check for brand-new user (no name set and first interaction)
  const history = await loadHistory(user.id);
  if (history.length === 0 && !user.name) {
    // First-ever message — send welcome
    const userMsg = { role: 'user', content: messageText };
    const assistantMsg = { role: 'assistant', content: WELCOME_MESSAGE };
    await saveHistory(user.id, [userMsg, assistantMsg]);
    return WELCOME_MESSAGE;
  }

  // Load connected apps
  const connectedApps = await getConnectedApps(user.id);

  // No apps connected — nudge them to onboard
  if (connectedApps.length === 0) {
    const userMsg = { role: 'user', content: messageText };
    const assistantMsg = { role: 'assistant', content: NO_APPS_MESSAGE };
    await saveHistory(user.id, [...history, userMsg, assistantMsg]);
    return NO_APPS_MESSAGE;
  }

  // Build system prompt and tools
  const { systemPrompt } = buildContext(user, connectedApps);
  const tools = getToolsForUser(connectedApps);

  // Add user message to history
  const messages = [...history, { role: 'user', content: messageText }];

  // First Claude call
  const response = await callClaude(systemPrompt, messages, tools);

  // If Claude wants to use tools, execute them and call again
  if (response.toolUseBlocks.length > 0) {
    // Build the assistant message with all content blocks
    const assistantContent = [];
    if (response.text) {
      assistantContent.push({ type: 'text', text: response.text });
    }
    for (const block of response.toolUseBlocks) {
      assistantContent.push(block);
    }

    // Execute each tool and collect results
    const toolResultMessages = [];
    for (const block of response.toolUseBlocks) {
      const result = await executeTool(user, block.name, block.input);
      toolResultMessages.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    // Build messages for follow-up call
    const followUpMessages = [
      ...messages,
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: toolResultMessages },
    ];

    // Determine if this is complex (>3 tool calls)
    const isComplex = response.toolUseBlocks.length > 3;

    // Second Claude call with tool results
    const finalResponse = await callClaude(systemPrompt, followUpMessages, tools, {
      complex: isComplex,
    });

    const finalText = finalResponse.text || "Done! Let me know if you need anything else.";

    // Save to history (simplified — store text only for history)
    await saveHistory(user.id, [
      ...messages,
      { role: 'assistant', content: finalText },
    ]);

    return finalText;
  }

  // No tool use — just a direct text response
  const replyText = response.text || "I'm not sure how to help with that. Could you try rephrasing?";

  await saveHistory(user.id, [
    ...messages,
    { role: 'assistant', content: replyText },
  ]);

  return replyText;
}

module.exports = { processMessage };

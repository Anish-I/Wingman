const { callLLM } = require('./llm');
const { buildContext } = require('./context');
const { getConversationHistory, appendMessage } = require('./redis');
const { getTools, executeTool, getConnectionLink, appFromToolName, selectToolsForMessage } = require('./composio');
const { extractAndSaveMemory, getMemoryContext } = require('./memory');
const { planAndCreateWorkflows } = require('./workflow-planner');
const { shouldCache, getCachedResponse, setCachedResponse } = require('./llm-cache');

const MAX_TOOL_ITERATIONS = 5;
const PROCESS_MESSAGE_TIMEOUT = parseInt(process.env.PROCESS_MESSAGE_TIMEOUT || '120000', 10);
const ITERATION_TIMEOUT = parseInt(process.env.ITERATION_TIMEOUT || '30000', 10);
const TOOL_EXEC_TIMEOUT = parseInt(process.env.TOOL_EXEC_TIMEOUT || '20000', 10);
const MAX_ORPHANED_PROMISES = parseInt(process.env.MAX_ORPHANED_PROMISES || '10', 10);

// Global counter for orphaned (post-timeout) promises still running in background
let _orphanedCount = 0;
function getOrphanedCount() { return _orphanedCount; }

function withTimeout(promise, ms, label) {
  let timerId;
  const timer = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timerId));
}

/**
 * Execute a tool with timeout tracking. Unlike bare withTimeout, this tracks
 * whether the underlying call completed (or will complete) after the timeout
 * fires. This prevents the LLM from retrying side-effecting tools whose
 * results simply arrived late.
 *
 * Returns { result, timedOut: false } on success, or throws an enriched error
 * with `timedOut: true` and `completionPromise` (a Promise that resolves when
 * the underlying call finishes) on timeout.
 */
function execWithTimeout(promise, ms, label) {
  let settled = false;
  const tracked = promise.then(
    (val) => { settled = true; return val; },
    (err) => { settled = true; throw err; }
  );

  let timerId;
  const timer = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.timedOut = true;
      // Allow callers to await eventual completion
      err.completionPromise = tracked.catch(() => null);
      reject(err);
    }, ms);
  });

  return Promise.race([
    tracked.then(result => ({ result, timedOut: false })),
    timer,
  ]).finally(() => clearTimeout(timerId));
}

class AbortError extends Error {
  constructor(msg = 'Operation aborted') { super(msg); this.name = 'AbortError'; }
}

function throwIfAborted(abortController, label) {
  if (abortController.aborted) throw new AbortError(`Aborted before ${label}`);
}

// Tool-name patterns that cause irrecoverable side effects (send, post, create, delete, etc.)
const SIDE_EFFECT_PATTERNS = /^(GMAIL_SEND|GMAIL_CREATE|SLACK_SENDS|SLACK_CHAT_POST|TWILIO_|TELNYX_|.*_SEND_|.*_CREATE_|.*_DELETE_|.*_UPDATE_|.*_POST_|.*_REMOVE_)/i;

const LOCAL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'CREATE_WORKFLOW',
      description: 'Create an automated workflow or recurring task. Use this when the user wants to set up something that runs on a schedule, triggers on events, or involves multi-step automation.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Natural language description of what the workflow should do, including schedule if any' },
        },
        required: ['description'],
      },
    },
  },
];

async function processMessage(user, messageText) {
  // Reject early if too many orphaned promises are already running
  if (_orphanedCount >= MAX_ORPHANED_PROMISES) {
    console.warn(`[user:${user.id}] Rejecting request: ${_orphanedCount} orphaned promises already in-flight (limit ${MAX_ORPHANED_PROMISES})`);
    return "I'm currently overloaded — please try again in a moment.";
  }

  const abortController = { aborted: false };
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.aborted = true;
      reject(new Error('Request timed out'));
    }, PROCESS_MESSAGE_TIMEOUT);
  });

  const innerPromise = _processMessageInner(user, messageText, abortController);

  try {
    const result = await Promise.race([innerPromise, timeout]);
    return result;
  } catch (err) {
    // On timeout, the inner promise is now orphaned — track it
    if (abortController.aborted) {
      _orphanedCount++;
      console.warn(`[user:${user.id}] Request timed out, orphaned promise tracked (count: ${_orphanedCount})`);
      innerPromise
        .catch(() => {}) // swallow — inner already handles its own errors
        .finally(() => {
          _orphanedCount--;
          console.log(`[user:${user.id}] Orphaned promise settled (remaining: ${_orphanedCount})`);
        });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _processMessageInner(user, messageText, abortController = { aborted: false }) {
  try {
  const userId = String(user.id);

  const [history, allTools] = await Promise.all([
    getConversationHistory(user.id),
    getTools(userId),
  ]);

  const selectedTools = selectToolsForMessage(allTools, messageText);
  const tools = [...LOCAL_TOOLS, ...selectedTools];
  // Build allowlist of tool names the LLM is permitted to call this turn
  const allowedToolNames = new Set(tools.map(t => t.function?.name).filter(Boolean));
  console.log(`[user:${userId}] Tools: ${tools.length}/${allTools.length}`);

  // Check semantic cache before doing any LLM work
  if (shouldCache(messageText)) {
    const cached = await getCachedResponse(messageText, userId);
    if (cached) {
      if (abortController.aborted) return cached;
      await appendMessage(user.id, 'user', messageText);
      await appendMessage(user.id, 'assistant', cached);
      return cached;
    }
  }

  const memoryContext = getMemoryContext(user);
  const { systemPrompt } = buildContext(user, tools, memoryContext);
  const messages = [...history, { role: 'user', content: messageText }];

  let response;
  let iterations = 0;
  let completed = false;

  while (iterations < MAX_TOOL_ITERATIONS) {
    throwIfAborted(abortController, 'LLM call');
    response = await callLLM(systemPrompt, messages, tools, { alreadyOpenAIFormat: true });

    throwIfAborted(abortController, 'tool execution');

    if (!response.toolUseBlocks || response.toolUseBlocks.length === 0) {
      completed = true;
      break;
    }

    // Append assistant turn
    const assistantContent = [];
    if (response.text) assistantContent.push({ type: 'text', text: response.text });
    for (const block of response.toolUseBlocks) assistantContent.push(block);
    messages.push({ role: 'assistant', content: assistantContent });

    // Execute each tool call, tracking completion per-tool to handle iteration timeouts gracefully
    const completedToolIds = new Set();
    const toolResults = [];

    const iterationWork = async () => {
    for (const block of response.toolUseBlocks) {
      // Check abort before each tool — prevents executing further tools
      // (especially side-effecting ones) after the request has timed out
      throwIfAborted(abortController, `tool:${block.name}`);

      let result;
      try {
        // Validate tool name against allowlist — reject anything the LLM
        // was not offered this turn (guards against prompt injection)
        if (!allowedToolNames.has(block.name)) {
          console.warn(`[user:${userId}] Blocked disallowed tool call: ${block.name}`);
          result = { error: `Tool "${block.name}" is not available. Only use tools provided to you.` };
          completedToolIds.add(block.id);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
          continue;
        }

        if (block.name === 'CREATE_WORKFLOW') {
          const workflows = await withTimeout(
            planAndCreateWorkflows(user, block.input.description),
            TOOL_EXEC_TIMEOUT, `CREATE_WORKFLOW`
          );
          result = { success: true, workflows: workflows.map(w => ({ id: w.id, name: w.name })) };
        } else {
          console.log(`[user:${userId}] Tool: ${block.name}`);
          const { result: toolResult } = await execWithTimeout(
            executeTool(userId, block),
            TOOL_EXEC_TIMEOUT, `tool:${block.name}`
          );
          result = toolResult;

          // Composio returns { successful, error } — surface errors cleanly
          if (result && result.successful === false) {
            const errMsg = result.error || 'Tool execution failed';

            // Detect not-connected errors — feed back into LLM loop
            // instead of returning early, so original intent is preserved
            if (/not connected|no connected account|connection not found/i.test(errMsg)) {
              const app = appFromToolName(block.name);
              const link = await getConnectionLink(userId, app).catch(() => null);
              const connectMsg = link
                ? `[${app} is not connected. Auth link: ${link}]`
                : `[${app} is not connected. User should connect at composio.dev]`;
              result = { error: connectMsg };
            } else {
              result = { error: errMsg };
            }
          }
        }
      } catch (err) {
        console.error(`[user:${userId}] Tool failed [${block.name}]:`, err.message);

        // Timeout on a side-effecting tool — the underlying call is still
        // in-flight and may succeed. Tell the LLM NOT to retry.
        if (err.timedOut && SIDE_EFFECT_PATTERNS.test(block.name)) {
          console.warn(`[user:${userId}] Side-effecting tool ${block.name} timed out — suppressing retry`);
          // Best-effort: wait briefly for late completion so we can give a definitive answer
          const late = await Promise.race([
            err.completionPromise,
            new Promise(resolve => setTimeout(() => resolve(null), 2000)),
          ]);
          if (late && late.successful !== false) {
            result = late;
          } else {
            result = { error: `Tool timed out but the action (${block.name}) may have already been executed. Do NOT retry this call — inform the user the action is pending and may complete shortly.` };
          }
        // Auth errors — feed back into LLM loop so intent is preserved
        } else if (/not connected|no connected account|unauthorized|401/i.test(err.message)) {
          const app = appFromToolName(block.name);
          const link = await getConnectionLink(userId, app).catch(() => null);
          const connectMsg = link
            ? `[${app} is not connected. Auth link: ${link}]`
            : `[${app} is not connected. User should connect at composio.dev]`;
          result = { error: connectMsg };
        } else {
          result = { error: err.message };
        }
      }

      completedToolIds.add(block.id);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
    };

    try {
      await withTimeout(iterationWork(), ITERATION_TIMEOUT, `iteration ${iterations + 1}`);
    } catch (iterErr) {
      // Iteration timed out — some tools may have completed, others are still in-flight.
      // Generate error results for tools that didn't finish so the LLM gets complete context.
      console.warn(`[user:${userId}] Iteration ${iterations + 1} timed out: ${iterErr.message}`);
      for (const block of response.toolUseBlocks) {
        if (!completedToolIds.has(block.id)) {
          const hasSideEffects = SIDE_EFFECT_PATTERNS.test(block.name);
          const msg = hasSideEffects
            ? `Tool timed out but the action (${block.name}) may have already been executed. Do NOT retry this call — inform the user the action is pending and may complete shortly.`
            : `Tool execution timed out — result unavailable. Do not retry this tool call; inform the user the operation is still pending.`;
          console.warn(`[user:${userId}] Tool ${block.name} (${block.id}) did not complete (sideEffect=${hasSideEffects}) — returning timeout error to LLM`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: msg }),
          });
        }
      }
    }

    messages.push({ role: 'user', content: toolResults });
    iterations++;
  }

  const finalText = response?.text || (completed
    ? 'Done! Let me know if you need anything else.'
    : "Sorry, I couldn't finish processing that. Please try again.");

  if (!completed) {
    console.warn(`[user:${userId}] Hit MAX_TOOL_ITERATIONS (${MAX_TOOL_ITERATIONS}), persisting history anyway`);
  }

  // Check abort immediately before persisting to close the TOCTOU window.
  // If the timeout fired between the loop exit and here, skip persistence.
  if (abortController.aborted) {
    console.warn(`[user:${userId}] Skipping history append: request timed out`);
    return finalText;
  }
  await appendMessage(user.id, 'user', messageText);
  await appendMessage(user.id, 'assistant', finalText);

  // Cache the response if eligible
  if (shouldCache(messageText) && finalText) {
    await setCachedResponse(messageText, finalText, userId);
  }

  // Fire-and-forget: extract memory with timeout guard (best-effort, must never crash)
  const MEMORY_EXTRACTION_TIMEOUT = 30000;
  Promise.race([
    extractAndSaveMemory(user, messages),
    new Promise((_, reject) => setTimeout(() => reject(new Error('memory extraction timed out')), MEMORY_EXTRACTION_TIMEOUT))
  ]).catch(err => { console.error('[async-task] memory extraction failed:', err.message); });

  return finalText;
  } catch (err) {
    // AbortError means the outer processMessage timed out and set the flag —
    // stop immediately and let the orphaned-promise tracker handle cleanup.
    if (err.name === 'AbortError') {
      console.warn(`[user:${userId}] Inner processing aborted: ${err.message}`);
      return "Sorry, that took too long. Please try again.";
    }
    // Friendly message for rate limit errors
    if (err.message && /rate limit|busy|too many/i.test(err.message)) {
      return "One sec — juggling a few things. Try again in a moment.";
    }
    if (err.message && /timed? ?out|abort/i.test(err.message)) {
      return "Sorry, that took too long. Please try again.";
    }
    throw err;
  }
}

module.exports = { processMessage, getOrphanedCount };

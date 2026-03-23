const { callLLM } = require('./llm');
const { buildContext } = require('./context');
const { getConversationHistory, appendMessage, acquireConversationLock } = require('./redis');
const { getTools, executeTool, getConnectionLink, appFromToolName, selectToolsForMessage } = require('./composio');
const { extractAndSaveMemory, getMemoryContext } = require('./memory');
const { planAndCreateWorkflows } = require('./workflow-planner');
const { shouldCache, getCachedResponse, setCachedResponse, releaseCacheLock } = require('./llm-cache');

const MAX_TOOL_ITERATIONS = 5;
const PROCESS_MESSAGE_TIMEOUT = parseInt(process.env.PROCESS_MESSAGE_TIMEOUT || '120000', 10);
const ITERATION_TIMEOUT = parseInt(process.env.ITERATION_TIMEOUT || '30000', 10);
const TOOL_EXEC_TIMEOUT = parseInt(process.env.TOOL_EXEC_TIMEOUT || '20000', 10);
const LLM_ITERATION_TIMEOUT = parseInt(process.env.LLM_ITERATION_TIMEOUT || '45000', 10);
const MAX_ORPHANED_PROMISES = parseInt(process.env.MAX_ORPHANED_PROMISES || '10', 10);
const ORPHAN_REAP_TIMEOUT = parseInt(process.env.ORPHAN_REAP_TIMEOUT || String(5 * 60 * 1000), 10); // 5 min max lifetime for orphaned tracking
// Sliding window for orphan counting — limits how long a user stays blocked (default 60s)
const ORPHAN_WINDOW_MS = parseInt(process.env.ORPHAN_WINDOW_MS || '60000', 10);
// Cap on distinct users tracked — prevents unbounded memory growth under sustained load
const MAX_ORPHAN_MAP_SIZE = parseInt(process.env.MAX_ORPHAN_MAP_SIZE || '500', 10);

// Per-user orphaned promise tracking — prevents one user's hung requests from blocking others.
// Each orphan gets a unique Symbol token so reap timers and settlement callbacks target their
// own entry rather than accidentally decrementing a newer orphan.
const _orphanedByUser = new Map(); // userId -> Map<token, timestamp>

function _getUserOrphanCount(userId) {
  const perUser = _orphanedByUser.get(userId);
  if (!perUser) return 0;
  const cutoff = Date.now() - ORPHAN_WINDOW_MS;
  let count = 0;
  for (const [token, ts] of perUser) {
    if (ts < cutoff) perUser.delete(token); // prune expired entries
    else count++;
  }
  if (perUser.size === 0) _orphanedByUser.delete(userId);
  return count;
}

function _isOrphanMapFull(userId) {
  return !_orphanedByUser.has(userId) && _orphanedByUser.size >= MAX_ORPHAN_MAP_SIZE;
}

function _addOrphan(userId) {
  if (_isOrphanMapFull(userId)) {
    console.error(`[user:${userId}] Orphan map at capacity (${MAX_ORPHAN_MAP_SIZE} users), rejecting`);
    return null;
  }
  const token = Symbol();
  const perUser = _orphanedByUser.get(userId) || new Map();
  perUser.set(token, Date.now());
  _orphanedByUser.set(userId, perUser);
  return token;
}

function _removeOrphan(userId, token) {
  if (!token) return;
  const perUser = _orphanedByUser.get(userId);
  if (!perUser) return;
  perUser.delete(token);
  if (perUser.size === 0) _orphanedByUser.delete(userId);
}

function getOrphanedCount() {
  let total = 0;
  // Iterate over a snapshot — _getUserOrphanCount mutates the map while pruning
  for (const userId of [..._orphanedByUser.keys()]) total += _getUserOrphanCount(userId);
  return total;
}

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
  // Reject early if this user has too many orphaned promises already running
  const userId = String(user.id);
  const userOrphanCount = _getUserOrphanCount(userId);
  if (userOrphanCount >= MAX_ORPHANED_PROMISES) {
    console.warn(`[user:${userId}] Rejecting request: ${userOrphanCount} orphaned promises already in-flight for this user (limit ${MAX_ORPHANED_PROMISES})`);
    return "I'm currently overloaded — please try again in a moment.";
  }

  // Reject early if the global orphan map is at capacity and this user isn't already tracked.
  // This prevents silent fail-open under sustained load — new users get a clear rejection
  // instead of bypassing orphan tracking entirely.
  if (_isOrphanMapFull(userId)) {
    console.error(`[user:${userId}] Rejecting request: orphan tracking at capacity (${MAX_ORPHAN_MAP_SIZE} users tracked)`);
    const err = new Error('Server overloaded — too many concurrent requests');
    err.statusCode = 429;
    throw err;
  }

  const abortController = { aborted: false };
  // Shared holder so we can force-release the lock on timeout even if the
  // orphaned inner promise is still running.
  const lockHolder = { releaseLock: null, released: false };
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.aborted = true;
      reject(new Error('Request timed out'));
    }, PROCESS_MESSAGE_TIMEOUT);
  });

  const innerPromise = _processMessageInner(user, messageText, abortController, lockHolder);

  try {
    const result = await Promise.race([innerPromise, timeout]);
    return result;
  } catch (err) {
    // On timeout, the inner promise is now orphaned — track it
    if (abortController.aborted) {
      // Force-release the lock immediately so subsequent messages aren't blocked
      // waiting for the orphaned inner promise to settle.
      if (lockHolder.releaseLock && !lockHolder.released) {
        lockHolder.released = true;
        lockHolder.releaseLock().catch(() => {});
      }
      const orphanToken = _addOrphan(userId);
      console.warn(`[user:${userId}] Request timed out, orphaned promise tracked (user count: ${_getUserOrphanCount(userId)}, global: ${getOrphanedCount()})`);
      let reaped = false;
      const reapTimer = setTimeout(() => {
        if (!reaped) {
          reaped = true;
          _removeOrphan(userId, orphanToken);
          console.warn(`[user:${userId}] Orphaned promise reaped after ${ORPHAN_REAP_TIMEOUT}ms (user remaining: ${_getUserOrphanCount(userId)})`);
        }
      }, ORPHAN_REAP_TIMEOUT);
      if (reapTimer.unref) reapTimer.unref(); // don't keep process alive
      innerPromise
        .catch(() => {}) // swallow — inner already handles its own errors
        .finally(() => {
          if (!reaped) {
            reaped = true;
            clearTimeout(reapTimer);
            _removeOrphan(userId, orphanToken);
            console.log(`[user:${userId}] Orphaned promise settled (user remaining: ${_getUserOrphanCount(userId)})`);
          }
        });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _processMessageInner(user, messageText, abortController = { aborted: false }, lockHolder = { releaseLock: null, released: false }) {
  const userId = String(user.id);

  // Acquire per-user lock to serialize concurrent requests.
  // Retry a few times with back-off before rejecting.
  let releaseLock;
  for (let attempt = 0; attempt < 4; attempt++) {
    releaseLock = await acquireConversationLock(user.id);
    if (releaseLock) break;
    if (attempt < 3) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  if (!releaseLock) {
    console.warn(`[user:${userId}] Could not acquire conversation lock — concurrent request in progress`);
    return "I'm still working on your previous message — please wait a moment.";
  }

  // If the outer timeout already fired while we were waiting for the lock,
  // release it immediately rather than doing any more work.
  if (abortController.aborted) {
    console.warn(`[user:${userId}] Aborted during lock acquisition — releasing lock immediately`);
    releaseLock().catch(() => {});
    return "Sorry, that took too long. Please try again.";
  }

  // Expose lock to caller so it can force-release on outer timeout
  lockHolder.releaseLock = releaseLock;

  try {
  const [history, allTools] = await Promise.all([
    getConversationHistory(user.id),
    getTools(userId),
  ]);

  // Append user message immediately so it's sequenced before any LLM work.
  // This ensures cache path and main path both have the message persisted atomically.
  await appendMessage(user.id, 'user', messageText);

  const selectedTools = selectToolsForMessage(allTools, messageText);
  const tools = [...LOCAL_TOOLS, ...selectedTools];
  // Build allowlist of tool names the LLM is permitted to call this turn
  const allowedToolNames = new Set(tools.map(t => t.function?.name).filter(Boolean));
  console.log(`[user:${userId}] Tools: ${tools.length}/${allTools.length}`);

  // Check semantic cache before doing any LLM work
  if (shouldCache(messageText)) {
    const cached = await getCachedResponse(messageText, userId);
    if (cached) {
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
    response = await withTimeout(
      callLLM(systemPrompt, messages, tools, { alreadyOpenAIFormat: true }),
      LLM_ITERATION_TIMEOUT, `LLM call (iteration ${iterations + 1})`
    );

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
      // AbortError must propagate — the request is cancelled, don't continue the loop
      if (iterErr.name === 'AbortError') throw iterErr;
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

  // User message was already appended before the LLM call — only persist
  // the assistant reply. On timeout, fire-and-forget so the caller isn't blocked.
  // But if the lock was force-released by the outer timeout, skip the append
  // entirely — a new request may already hold the lock and be writing messages.
  if (abortController.aborted) {
    if (!lockHolder.released) {
      console.warn(`[user:${userId}] Request timed out — persisting assistant reply in background`);
      appendMessage(user.id, 'assistant', finalText)
        .catch(e => console.error(`[user:${userId}] Background history persist failed:`, e.message));
    } else {
      console.warn(`[user:${userId}] Request timed out and lock already force-released — skipping appendMessage to avoid race`);
    }
    if (shouldCache(messageText)) releaseCacheLock(messageText, userId).catch(() => {});
    return finalText;
  }
  await appendMessage(user.id, 'assistant', finalText);

  // Cache the response if eligible
  if (shouldCache(messageText) && finalText) {
    await setCachedResponse(messageText, finalText, userId);
  }

  // Fire-and-forget: extract memory with timeout guard (best-effort, must never crash)
  const MEMORY_EXTRACTION_TIMEOUT = 30000;
  let memoryTimer;
  Promise.race([
    extractAndSaveMemory(user, messages),
    new Promise((_, reject) => {
      memoryTimer = setTimeout(() => reject(new Error('memory extraction timed out')), MEMORY_EXTRACTION_TIMEOUT);
      if (memoryTimer.unref) memoryTimer.unref();
    })
  ])
    .finally(() => clearTimeout(memoryTimer))
    .catch(err => { console.error(`[user:${userId}] memory extraction failed:`, err.message); });

  return finalText;
  } catch (err) {
    // Release stampede lock so other requests aren't blocked for 30s
    if (shouldCache(messageText)) releaseCacheLock(messageText, userId).catch(() => {});

    // AbortError means the outer processMessage timed out and set the flag —
    // stop immediately and let the orphaned-promise tracker handle cleanup.
    // If the lock was force-released by the outer timeout, another request may
    // already hold the lock.  Skip all appendMessage calls to avoid concurrent writes.
    const lockLost = lockHolder.released;

    if (err.name === 'AbortError') {
      console.warn(`[user:${userId}] Inner processing aborted: ${err.message}`);
      if (!lockLost) {
        appendMessage(user.id, 'assistant', "Sorry, that took too long. Please try again.")
          .catch(e => console.error(`[user:${userId}] Abort history persist failed:`, e.message));
      }
      return "Sorry, that took too long. Please try again.";
    }
    // Friendly message for rate limit errors
    if (err.message && /rate limit|busy|too many/i.test(err.message)) {
      const rateLimitMsg = "One sec — juggling a few things. Try again in a moment.";
      if (!lockLost) {
        appendMessage(user.id, 'assistant', rateLimitMsg)
          .catch(e => console.error(`[user:${userId}] Rate-limit history persist failed:`, e.message));
      }
      return rateLimitMsg;
    }
    if (err.message && /timed? ?out|abort/i.test(err.message)) {
      if (!lockLost) {
        appendMessage(user.id, 'assistant', "Sorry, that took too long. Please try again.")
          .catch(e => console.error(`[user:${userId}] Timeout history persist failed:`, e.message));
      }
      return "Sorry, that took too long. Please try again.";
    }
    // Any other LLM/service failure — persist error response so the user's
    // message doesn't appear unanswered on retry or app restart.
    console.error(`[user:${userId}] Unhandled LLM error:`, err.message);
    const errorMsg = "Something went wrong on my end. Please try again.";
    if (!lockLost) {
      appendMessage(user.id, 'assistant', errorMsg)
        .catch(e => console.error(`[user:${userId}] Error history persist failed:`, e.message));
    }
    return errorMsg;
  } finally {
    if (releaseLock && !lockHolder.released) {
      lockHolder.released = true;
      await releaseLock().catch(() => {});
    }
  }
}

module.exports = { processMessage, getOrphanedCount };

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
let _orphanedByUser = new Map(); // userId -> Map<token, timestamp>
let _totalOrphanCount = 0; // O(1) global counter kept in sync by add/remove/sweep
let _lastSweepTime = 0; // monotonic timestamp of the last successful sweep

// Sweep stale entries from the orphan map.  Called periodically, on-demand
// when the map is at capacity, AND lazily at the start of processMessage
// when enough time has elapsed — so entries for inactive users cannot
// accumulate even if the periodic timer is delayed by event-loop congestion.
function _sweepOrphans() {
  try {
    const cutoff = Date.now() - ORPHAN_WINDOW_MS;
    // Rebuild from scratch instead of mutating in-place.  V8's Map does not
    // shrink its internal hash table after deletions, so in-place delete leaves
    // the backing store at its high-water-mark size.  Rebuilding lets the old
    // Map (and its oversized hash table) be GC'd, preventing monotonic memory
    // growth when many distinct user IDs cycle through orphan tracking.
    const fresh = new Map();
    let liveCount = 0;
    for (const [userId, perUser] of _orphanedByUser) {
      const liveTokens = new Map();
      for (const [token, ts] of perUser) {
        if (ts >= cutoff) {
          liveTokens.set(token, ts);
          liveCount++;
        }
      }
      if (liveTokens.size > 0) fresh.set(userId, liveTokens);
    }
    _orphanedByUser = fresh;
    _totalOrphanCount = liveCount;
    _lastSweepTime = Date.now();
  } catch (err) {
    console.error('[orphan-sweep] Unexpected error during sweep:', err.message);
  }
}

function _getUserOrphanCount(userId) {
  const perUser = _orphanedByUser.get(userId);
  if (!perUser) return 0;
  const cutoff = Date.now() - ORPHAN_WINDOW_MS;
  let count = 0;
  for (const [token, ts] of perUser) {
    if (ts < cutoff) { perUser.delete(token); _totalOrphanCount = Math.max(0, _totalOrphanCount - 1); }
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
    // On-demand sweep: evict stale entries before giving up.  Under production
    // load the periodic sweep may not have run recently enough, so this ensures
    // expired entries are reclaimed immediately when space is needed.
    _sweepOrphans();
    if (_isOrphanMapFull(userId)) {
      console.error(`[user:${userId}] Orphan map at capacity (${MAX_ORPHAN_MAP_SIZE} users) after sweep, rejecting`);
      return null;
    }
  }
  const token = Symbol();
  const perUser = _orphanedByUser.get(userId) || new Map();
  perUser.set(token, Date.now());
  _orphanedByUser.set(userId, perUser);
  _totalOrphanCount++;
  return token;
}

function _removeOrphan(userId, token) {
  if (!token) return;
  const perUser = _orphanedByUser.get(userId);
  if (!perUser) return;
  if (perUser.delete(token)) _totalOrphanCount = Math.max(0, _totalOrphanCount - 1);
  if (perUser.size === 0) _orphanedByUser.delete(userId);
}

function getOrphanedCount() {
  return _totalOrphanCount;
}

// Periodic sweep to prune stale orphan entries for inactive users.
// Without this, per-user Maps can retain expired timestamps indefinitely
// if _getUserOrphanCount is never called again for that user.
const ORPHAN_SWEEP_INTERVAL_MS = parseInt(process.env.ORPHAN_SWEEP_INTERVAL_MS || '60000', 10);
const _orphanSweepTimer = setInterval(_sweepOrphans, ORPHAN_SWEEP_INTERVAL_MS);
_orphanSweepTimer.unref(); // don't prevent process exit

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
  // Lazy sweep: if enough time has passed since the last sweep and stale
  // entries may exist, sweep inline before checking orphan counts.  This
  // guarantees cleanup even if the periodic setInterval timer is delayed
  // by event-loop congestion under heavy load.
  if (_orphanedByUser.size > 0 && Date.now() - _lastSweepTime > ORPHAN_SWEEP_INTERVAL_MS) {
    _sweepOrphans();
  }

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
  // Shared state so the inner function can guard writes and drain in-flight
  // appends before releasing the lock in its own finally block.
  const lockHolder = { releaseLock: null, released: false, inflightAppend: null, lockExpiry: null };
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
    // On timeout, the inner promise is now orphaned — block its writes,
    // drain any in-flight append, then release the lock so a retry can
    // safely acquire it without interleaving messages.
    if (abortController.aborted) {
      // Block all further safeAppend calls from the orphaned inner promise.
      // This must happen BEFORE draining/releasing so no new writes can
      // start between the drain and the lock release.
      lockHolder.released = true;

      // Drain any in-flight append so it completes before we release the lock.
      if (lockHolder.inflightAppend) {
        await lockHolder.inflightAppend.catch(e =>
          console.error(`[user:${userId}] Inflight append drain failed:`, e.message));
      }

      // Explicitly release the lock now that no more writes can happen.
      if (lockHolder.releaseLock) {
        if (lockHolder.lockExpiry && Date.now() < lockHolder.lockExpiry) {
          await lockHolder.releaseLock().catch(e =>
            console.error(`[user:${userId}] Failed to release lock after timeout:`, e.message));
        }
      }

      // Track the orphan — it's harmless now since released=true blocks
      // all writes, but we still track it for backpressure purposes.
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
        .catch(err => { console.error(`[user:${userId}] Orphaned inner promise error:`, err.message); })
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

  // Guarded append — skips the write once the lock has been released
  // (i.e. after the finally block runs), preventing concurrent appendMessage
  // calls from two requests.
  // Appends are serialized through a promise chain so the released/TTL check
  // and the Redis write happen in the same microtask, closing the TOCTOU window
  // where the lock could be released between the check and the actual write.
  let appendChain = Promise.resolve();
  const safeAppend = (role, text) => {
    if (lockHolder.released) {
      console.warn(`[user:${userId}] Lock released — skipping appendMessage(${role})`);
      return Promise.resolve();
    }
    // Chain the append so it waits for any prior write to complete, then
    // re-checks the lock state in the same microtask as the Redis call.
    const p = appendChain.then(() => {
      // Re-check after preceding append completes — the lock may have been
      // released or TTL-expired while the previous write was in flight.
      if (lockHolder.released) {
        console.warn(`[user:${userId}] Lock released (chain) — skipping appendMessage(${role})`);
        return;
      }
      if (lockHolder.lockExpiry && Date.now() > lockHolder.lockExpiry - LOCK_SAFETY_MARGIN_MS) {
        console.warn(`[user:${userId}] Lock TTL expired (chain) — skipping appendMessage(${role})`);
        lockHolder.released = true;
        return;
      }
      return appendMessage(user.id, role, text);
    });
    appendChain = p.catch(err => { console.error(`[user:${userId}] appendMessage(${role}) failed:`, err.message); });
    lockHolder.inflightAppend = p;
    p.finally(() => {
      if (lockHolder.inflightAppend === p) lockHolder.inflightAppend = null;
    });
    return p;
  };

  // Acquire per-user lock to serialize concurrent requests.
  // The lock TTL must exceed PROCESS_MESSAGE_TIMEOUT + the longest sub-operation
  // timeout (LLM_ITERATION_TIMEOUT) so that the Redis key does not auto-expire
  // while _processMessageInner is still winding down after an outer abort.
  // Without this margin the lock disappears, a second request acquires it, and
  // both call appendMessage() concurrently — producing duplicate/out-of-order messages.
  const LOCK_TTL_SECONDS = Math.ceil((PROCESS_MESSAGE_TIMEOUT + LLM_ITERATION_TIMEOUT + 30000) / 1000);
  const LOCK_SAFETY_MARGIN_MS = 5000; // refuse writes this far before TTL to avoid racing Redis expiry
  let releaseLock;
  for (let attempt = 0; attempt < 4; attempt++) {
    releaseLock = await acquireConversationLock(user.id, LOCK_TTL_SECONDS);
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
    releaseLock().catch(e => console.error(`[user:${userId}] Failed to release lock after abort:`, e.message));
    return "Sorry, that took too long. Please try again.";
  }

  // Track when the Redis lock will auto-expire so safeAppend can refuse
  // writes once the lock is no longer guaranteed to be held.
  lockHolder.lockExpiry = Date.now() + (LOCK_TTL_SECONDS * 1000);
  // Expose lock to caller so it can force-release on outer timeout
  lockHolder.releaseLock = releaseLock;

  try {
  const [history, allTools] = await Promise.all([
    getConversationHistory(user.id),
    getTools(userId),
  ]);

  // Append user message immediately so it's sequenced before any LLM work.
  // This ensures cache path and main path both have the message persisted atomically.
  await safeAppend('user', messageText);

  const selectedTools = selectToolsForMessage(allTools, messageText);
  const tools = [...LOCAL_TOOLS, ...selectedTools];
  // Build allowlist of tool names the LLM is permitted to call this turn
  const allowedToolNames = new Set(tools.map(t => t.function?.name).filter(Boolean));
  console.log(`[user:${userId}] Tools: ${tools.length}/${allTools.length}`);

  // Check semantic cache before doing any LLM work
  if (shouldCache(messageText)) {
    const cached = await getCachedResponse(messageText, userId);
    if (cached) {
      await safeAppend('assistant', cached);
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
  // the assistant reply.  The lock is still held (released in the finally
  // block), so safeAppend is safe here even after abort.
  if (abortController.aborted) {
    console.warn(`[user:${userId}] Request timed out — persisting assistant reply before releasing lock`);
    await safeAppend('assistant', finalText);
    if (shouldCache(messageText)) releaseCacheLock(messageText, userId).catch(err => { console.error(`[user:${userId}] releaseCacheLock failed:`, err.message); });
    return finalText;
  }
  await safeAppend('assistant', finalText);

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
    if (shouldCache(messageText)) releaseCacheLock(messageText, userId).catch(err => { console.error(`[user:${userId}] releaseCacheLock failed:`, err.message); });

    // AbortError means the outer processMessage timed out and set the flag —
    // stop immediately.  The lock is still held (the outer handler no longer
    // force-releases it), so we can safely persist the timeout reply before
    // the finally block releases the lock.
    if (err.name === 'AbortError') {
      console.warn(`[user:${userId}] Inner processing aborted: ${err.message}`);
      await safeAppend('assistant', "Sorry, that took too long. Please try again.");
      return "Sorry, that took too long. Please try again.";
    }
    // Friendly message for rate limit errors
    if (err.message && /rate limit|busy|too many/i.test(err.message)) {
      const rateLimitMsg = "One sec — juggling a few things. Try again in a moment.";
      safeAppend('assistant', rateLimitMsg)
        .catch(e => console.error(`[user:${userId}] Rate-limit history persist failed:`, e.message));
      return rateLimitMsg;
    }
    if (err.message && /timed? ?out|abort/i.test(err.message)) {
      safeAppend('assistant', "Sorry, that took too long. Please try again.")
        .catch(e => console.error(`[user:${userId}] Timeout history persist failed:`, e.message));
      return "Sorry, that took too long. Please try again.";
    }
    // Any other LLM/service failure — persist error response so the user's
    // message doesn't appear unanswered on retry or app restart.
    console.error(`[user:${userId}] Unhandled LLM error:`, err.message);
    const errorMsg = "Something went wrong on my end. Please try again.";
    safeAppend('assistant', errorMsg)
      .catch(e => console.error(`[user:${userId}] Error history persist failed:`, e.message));
    return errorMsg;
  } finally {
    // Always drain in-flight appends regardless of who set `released`.
    // Without this, when the reap timer or orphan settlement sets released=true
    // while an append is mid-flight, the finally block would skip draining,
    // leaving a Redis write racing with the next request's writes after TTL expiry.
    if (lockHolder.inflightAppend) {
      await lockHolder.inflightAppend.catch(e => console.error(`[user:${userId}] Inflight append failed:`, e.message));
    }
    if (releaseLock && !lockHolder.released) {
      lockHolder.released = true;
      // Only explicitly release if the TTL hasn't expired — if it has,
      // Redis already removed the key and a new request may hold the lock.
      // Calling release on an expired lock could delete the NEW lock key.
      if (lockHolder.lockExpiry && Date.now() < lockHolder.lockExpiry) {
        await releaseLock().catch(e => console.error(`[user:${userId}] Failed to release conversation lock:`, e.message));
      } else {
        console.warn(`[user:${userId}] Lock TTL expired — skipping explicit release to avoid deleting a newer lock`);
      }
    }
  }
}

module.exports = { processMessage, getOrphanedCount };

const { callLLM, MAX_TOKENS } = require('./llm');
const { buildContext } = require('./context');
const { getConversationHistory, appendMessage, acquireConversationLock } = require('./redis');
const { getTools, executeTool, getConnectionLink, getConnectionStatus, appFromToolName, selectToolsForMessage } = require('./composio');
const { extractAndSaveMemory, getMemoryContext } = require('./memory');
const { planAndCreateWorkflows } = require('./workflow-planner');
const { shouldCache, getCachedResponse, setCachedResponse, releaseCacheLock } = require('./llm-cache');
const { redis } = require('./redis');
const { validateToolArgs } = require('../lib/validate-tool-args');
const { sanitizeUserMessage } = require('../lib/sanitize-message');
const logger = require('./logger');
const crypto = require('crypto');

// Payload size limits for LLM tool-call inputs (mirrors api.js workflow validation)
const MAX_TOOL_INPUT_KEYS = 50;
const MAX_TOOL_INPUT_STRING_LENGTH = 10000;
const MAX_TOOL_INPUT_DEPTH = 5;
const MAX_TOOL_INPUT_BYTES = 100 * 1024; // 100 KB serialized payload cap

/**
 * Validate the size of a tool-call input to prevent memory exhaustion from
 * oversized payloads.  Returns null if valid, or an error string.
 */
function validateToolInputSize(obj, depth = 0) {
  if (depth > MAX_TOOL_INPUT_DEPTH) return `input exceeds maximum nesting depth (${MAX_TOOL_INPUT_DEPTH})`;
  if (obj === null || obj === undefined) return null;
  const type = typeof obj;
  if (type === 'string') {
    if (obj.length > MAX_TOOL_INPUT_STRING_LENGTH) return `string value exceeds maximum length (${MAX_TOOL_INPUT_STRING_LENGTH})`;
    return null;
  }
  if (type !== 'object') return null; // primitives are fine
  if (Array.isArray(obj)) {
    if (obj.length > MAX_TOOL_INPUT_KEYS) return `array exceeds maximum length (${MAX_TOOL_INPUT_KEYS})`;
    for (let i = 0; i < obj.length; i++) {
      const r = validateToolInputSize(obj[i], depth + 1);
      if (r) return r;
    }
    return null;
  }
  const keys = Object.keys(obj);
  if (keys.length > MAX_TOOL_INPUT_KEYS) return `object exceeds maximum number of keys (${MAX_TOOL_INPUT_KEYS})`;
  for (const key of keys) {
    const r = validateToolInputSize(obj[key], depth + 1);
    if (r) return r;
  }
  return null;
}

// Token budget for conversation history trimming.
// Conservative context window — use the smallest common denominator across
// providers (Groq llama-3.3-70b = 128k).  Override via env if needed.
const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW_TOKENS || '128000', 10);
// Reserve tokens for the LLM response + a safety margin for tool definitions / overhead
const HISTORY_TOKEN_BUDGET = CONTEXT_WINDOW - MAX_TOKENS - 4096; // response + overhead

/**
 * Rough token estimate: ~4 chars per token for English text.
 * Accurate enough for budget trimming without adding a tokenizer dependency.
 */
function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text === 'string') return Math.ceil(text.length / 4);
  // Array content blocks (tool results, etc.)
  return Math.ceil(JSON.stringify(text).length / 4);
}

/**
 * Trim conversation history (oldest first) so the total token count of
 * systemPrompt + history + currentMessage stays within HISTORY_TOKEN_BUDGET.
 * Returns a (possibly shorter) copy of the history array.
 */
function trimHistoryToTokenBudget(history, systemPromptTokens, currentMessageTokens) {
  const available = HISTORY_TOKEN_BUDGET - systemPromptTokens - currentMessageTokens;
  if (available <= 0) return []; // system prompt + current message already exceed budget

  // Estimate tokens per history message
  const estimates = history.map(m => estimateTokens(m.content));
  let total = estimates.reduce((sum, t) => sum + t, 0);

  if (total <= available) return history; // fits as-is

  // Drop oldest messages until we're within budget
  let startIdx = 0;
  while (startIdx < history.length && total > available) {
    total -= estimates[startIdx];
    startIdx++;
  }
  if (startIdx > 0) {
    logger.info({ dropped: startIdx, remaining: history.length - startIdx, budget: available },
      '[orchestrator] Trimmed conversation history to fit token budget');
  }
  return history.slice(startIdx);
}

const MAX_TOOL_ITERATIONS = 5;
const PROCESS_MESSAGE_TIMEOUT = parseInt(process.env.PROCESS_MESSAGE_TIMEOUT || '120000', 10);
const ITERATION_TIMEOUT = parseInt(process.env.ITERATION_TIMEOUT || '30000', 10);
const TOOL_EXEC_TIMEOUT = parseInt(process.env.TOOL_EXEC_TIMEOUT || '20000', 10);
const LLM_ITERATION_TIMEOUT = Math.min(
  parseInt(process.env.LLM_ITERATION_TIMEOUT || '25000', 10),
  ITERATION_TIMEOUT - 2000   // must fire before iteration timeout to avoid races
);
const MAX_ORPHANED_PROMISES = parseInt(process.env.MAX_ORPHANED_PROMISES || '10', 10);
// Reap timeout should be just above the sliding window so entries are cleaned up
// shortly after they stop counting — the old 5-min default was far too long and
// caused Redis key bloat under sustained load.
const ORPHAN_REAP_TIMEOUT = parseInt(process.env.ORPHAN_REAP_TIMEOUT || String(90_000), 10); // 90s (window + 30s buffer)
// Sliding window for orphan counting — limits how long a user stays blocked (default 60s)
const ORPHAN_WINDOW_MS = parseInt(process.env.ORPHAN_WINDOW_MS || '60000', 10);

// Redis key prefix for orphan sorted sets (one per user).
// Score = timestamp (ms), member = unique token string.
// Key TTL = ORPHAN_REAP_TIMEOUT so entries auto-expire even with no sweep.
const ORPHAN_KEY_PREFIX = 'wingman:orphans:';
const ORPHAN_SWEEP_INTERVAL_MS = parseInt(process.env.ORPHAN_SWEEP_INTERVAL_MS || '60000', 10);

// Sentinel value used by Promise.race to distinguish reap-timeout resolution
// from a legitimate completionPromise result (which could be null/undefined).
const _REAPED = Symbol('orphan-reaped');

// Add an orphan entry to Redis.  Returns a token string for later removal.
async function _addOrphan(userId) {
  const token = crypto.randomUUID();
  const key = ORPHAN_KEY_PREFIX + userId;
  try {
    await redis.zadd(key, Date.now(), token);
    // Auto-expire the key if no sweep or removal happens (e.g. process dies).
    await redis.pexpire(key, ORPHAN_REAP_TIMEOUT + 60000);
  } catch (err) {
    logger.error({ err: err.message }, `[user:${userId}] Failed to track orphan in Redis`);
    return null;
  }
  return token;
}

// Remove a specific orphan entry from Redis.
async function _removeOrphan(userId, token) {
  if (!token) return;
  try {
    await redis.zrem(ORPHAN_KEY_PREFIX + userId, token);
  } catch (err) {
    logger.error({ err: err.message }, `[user:${userId}] Failed to remove orphan from Redis`);
  }
}

// Count non-expired orphans for a user (entries within the sliding window).
async function _getUserOrphanCount(userId) {
  try {
    const key = ORPHAN_KEY_PREFIX + userId;
    const cutoff = Date.now() - ORPHAN_WINDOW_MS;
    await redis.zremrangebyscore(key, '-inf', cutoff);
    return await redis.zcard(key);
  } catch (err) {
    logger.error({ err: err.message }, `[user:${userId}] Failed to read orphan count from Redis`);
    return 0; // fail-open: allow the request through
  }
}

// Collect all orphan keys using SCAN (non-blocking) instead of KEYS.
async function _scanOrphanKeys() {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', ORPHAN_KEY_PREFIX + '*', 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

// Global orphan count across all users.
// Prunes expired entries first (like _getUserOrphanCount) so stale entries
// don't inflate the count.
async function getOrphanedCount() {
  try {
    const keys = await _scanOrphanKeys();
    if (keys.length === 0) return 0;
    const cutoff = Date.now() - ORPHAN_WINDOW_MS;
    // Prune expired entries before counting.
    const prunePipeline = redis.pipeline();
    for (const key of keys) prunePipeline.zremrangebyscore(key, '-inf', cutoff);
    await prunePipeline.exec();
    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.zcard(key);
    const results = await pipeline.exec();
    return results.reduce((sum, [err, count]) => sum + (err ? 0 : count), 0);
  } catch (err) {
    logger.error({ err: err.message }, '[orphan] Failed to read global orphan count');
    return 0;
  }
}

// Background sweep: prune expired entries from all orphan keys and remove
// empty keys.  Runs periodically so entries are cleaned even if the user
// never sends another request — solving the silent-user leak.
async function _sweepOrphans() {
  try {
    const keys = await _scanOrphanKeys();
    if (keys.length === 0) return;
    const cutoff = Date.now() - ORPHAN_WINDOW_MS;
    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.zremrangebyscore(key, '-inf', cutoff);
    await pipeline.exec();
    // Remove now-empty keys to avoid key-space bloat.
    const cardPipeline = redis.pipeline();
    for (const key of keys) cardPipeline.zcard(key);
    const counts = await cardPipeline.exec();
    const delPipeline = redis.pipeline();
    let delCount = 0;
    for (let i = 0; i < keys.length; i++) {
      const [err, count] = counts[i];
      if (!err && count === 0) { delPipeline.del(keys[i]); delCount++; }
    }
    if (delCount > 0) await delPipeline.exec();
  } catch (err) {
    logger.error({ err: err.message }, '[orphan-sweep] Unexpected error during sweep');
  }
}

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
function execWithTimeout(promiseOrFn, ms, label, { controller } = {}) {
  // If a function is passed, call it with the abort controller so the callee
  // can wire up the signal.  If a bare promise is passed, use it directly.
  const ac = controller || new AbortController();
  const promise = typeof promiseOrFn === 'function' ? promiseOrFn(ac) : promiseOrFn;

  let settled = false;
  const tracked = promise.then(
    (val) => { settled = true; return val; },
    (err) => { settled = true; throw err; }
  );

  let timerId;
  const timer = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      // Abort the underlying work (e.g. HTTP requests) — not just the race.
      ac.abort();
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

// TTL for in-flight outcome records (10 min — outlives any realistic late completion)
const INFLIGHT_OUTCOME_TTL = parseInt(process.env.INFLIGHT_OUTCOME_TTL || '600', 10);

/**
 * Build a Redis key for tracking the outcome of a timed-out side-effecting tool.
 * Uses the same hashing approach as composio idempotency so the key is stable
 * across retries with identical arguments.
 */
function _inflightOutcomeKey(userId, toolName, toolInput) {
  const payload = `${userId}:${toolName}:${JSON.stringify(toolInput)}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return `tool:outcome:${hash}`;
}

/**
 * Record a pending in-flight action in Redis and attach a background handler
 * to the completionPromise that will update the record with the actual outcome.
 * This closes the gap where the orchestrator abandons completionPromise after
 * the 2-second grace period — the system now knows definitively whether the
 * action completed, failed, or is still pending.
 */
async function _trackInflightOutcome(userId, toolName, toolInput, completionPromise) {
  const key = _inflightOutcomeKey(userId, toolName, toolInput);
  const pending = JSON.stringify({ status: 'pending', toolName, ts: Date.now() });
  try {
    await redis.set(key, pending, 'EX', INFLIGHT_OUTCOME_TTL);
  } catch (err) {
    logger.error({ err: err.message }, `[user:${userId}] Failed to write inflight outcome for ${toolName}`);
  }

  // Fire-and-forget: update Redis when the underlying call eventually settles.
  // Only track as orphan when we have a completionPromise that will eventually
  // settle and clean up.  Previously, _addOrphan was called unconditionally —
  // when completionPromise was null the orphan token was never removed, leaking
  // an entry in Redis and inflating the user's orphan count.
  //
  // We race completionPromise against a reap timeout so the handler chain
  // ALWAYS settles within ORPHAN_REAP_TIMEOUT.  Without the race, handlers
  // attached directly to a never-settling promise pin their closures
  // (orphanToken, reapTimer, Redis key, logger) in memory indefinitely —
  // an unbounded leak under sustained load with many hanging tool calls.
  // With Promise.race, only a tiny internal race-handler closure remains on
  // the original promise; the heavy closures live on the race chain which
  // settles promptly.
  if (completionPromise) {
    const orphanToken = await _addOrphan(userId);

    // Reap promise settles the race if completionPromise hangs forever.
    let reapTimer;
    const reapPromise = new Promise(resolve => {
      reapTimer = setTimeout(() => resolve(_REAPED), ORPHAN_REAP_TIMEOUT);
      if (reapTimer.unref) reapTimer.unref();
    });

    Promise.race([completionPromise, reapPromise])
      .then((result) => {
        clearTimeout(reapTimer);
        if (result === _REAPED) return; // timed out — no outcome to record
        const succeeded = result && result.successful !== false;
        const record = JSON.stringify({
          status: succeeded ? 'completed' : 'failed',
          toolName,
          ts: Date.now(),
          result: succeeded ? result : undefined,
          error: !succeeded ? (result?.error || 'Unknown failure') : undefined,
        });
        return redis.set(key, record, 'EX', INFLIGHT_OUTCOME_TTL);
      })
      .catch((err) => {
        clearTimeout(reapTimer);
        const record = JSON.stringify({
          status: 'failed',
          toolName,
          ts: Date.now(),
          error: err?.message || 'Unknown error',
        });
        return redis.set(key, record, 'EX', INFLIGHT_OUTCOME_TTL).catch(() => {});
      })
      .finally(() => {
        _removeOrphan(userId, orphanToken)
          .catch(e => { logger.error({ err: e.message }, `[user:${userId}] Failed to remove orphan from Redis`); });
      });
  }
}

/**
 * Check whether a previously timed-out side-effecting tool has since completed.
 * Returns the outcome record if one exists, or null.
 */
async function _getInflightOutcome(userId, toolName, toolInput) {
  const key = _inflightOutcomeKey(userId, toolName, toolInput);
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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
  // Check orphan count — degrade to text-only mode instead of hard-rejecting.
  // Hard rejection caused a DoS cycle: user blocked → retries → creates more
  // orphans → blocked again.  Degrading to text-only breaks the cycle because
  // no new tool calls are made and therefore no new orphans are created.
  const userId = String(user.id);
  const userOrphanCount = await _getUserOrphanCount(userId);
  let toolsDisabled = false;
  if (userOrphanCount >= MAX_ORPHANED_PROMISES) {
    toolsDisabled = true;
    console.warn(`[user:${userId}] Orphan limit reached (${userOrphanCount}/${MAX_ORPHANED_PROMISES}) — proceeding without tools`);
  }

  const abortController = { aborted: false, _listeners: [] };
  abortController.onAbort = (fn) => { abortController._listeners.push(fn); };
  abortController.fireAbort = () => { abortController.aborted = true; for (const fn of abortController._listeners) fn(); };
  // Shared state so the inner function can guard writes and drain in-flight
  // appends before releasing the lock in its own finally block.
  const lockHolder = { releaseLock: null, released: false, inflightAppend: null, lockExpiry: null };
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.fireAbort();
      reject(new Error('Request timed out'));
    }, PROCESS_MESSAGE_TIMEOUT);
  });

  const innerPromise = _processMessageInner(user, messageText, abortController, lockHolder, toolsDisabled);

  try {
    const result = await Promise.race([innerPromise, timeout]);
    return result;
  } catch (err) {
    // On timeout, the inner promise is now orphaned — the abort flag blocks
    // its writes, and the inner promise's finally block will release the lock
    // once it winds down (via throwIfAborted at the next LLM/tool boundary).
    if (abortController.aborted) {
      // Do NOT release the lock here. The inner promise's finally block is
      // the sole owner of lock lifecycle. Releasing here created a data
      // integrity window: the retry could acquire the lock while the
      // orphaned inner promise still had in-flight Redis writes, causing
      // interleaved message appends in conversation history.
      //
      // The abort flag (abortController.aborted) blocks all further
      // safeAppend writes, and throwIfAborted causes the inner promise to
      // exit quickly — reaching its finally block which drains in-flight
      // appends and releases the lock safely.

      // NOTE: We intentionally do NOT add a request-level orphan here.
      // Individual tool calls already create their own orphan entries via
      // _trackInflightOutcome, providing per-tool backpressure tracking.
      // Adding a request-level orphan on top caused double-counting: a
      // single request with N timed-out tool calls would create N+1 orphan
      // entries, rapidly exhausting MAX_ORPHANED_PROMISES and blocking the
      // user far sooner than intended.
      console.warn(`[user:${userId}] Request timed out, inner promise orphaned`);
      innerPromise
        .catch(err => { logger.error({ err: err.message }, `[user:${userId}] Orphaned inner promise error`); })
        .finally(() => {
          console.log(`[user:${userId}] Orphaned promise settled`);
        });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _processMessageInner(user, messageText, abortController = { aborted: false }, lockHolder = { releaseLock: null, released: false }, toolsDisabled = false) {
  const userId = String(user.id);

  // Guarded append — skips the write once the lock has been released
  // (i.e. after the finally block runs), preventing concurrent appendMessage
  // calls from two requests.
  // Appends are serialized through a promise chain so the released/TTL check
  // and the Redis write happen in the same microtask, closing the TOCTOU window
  // where the lock could be released between the check and the actual write.
  let appendChain = Promise.resolve();
  const safeAppend = (role, text) => {
    if (lockHolder.released || abortController.aborted) {
      console.warn(`[user:${userId}] Lock released or aborted — skipping appendMessage(${role})`);
      return Promise.resolve();
    }
    // Chain the append so it waits for any prior write to complete, then
    // re-checks the lock state in the same microtask as the Redis call.
    const p = appendChain.then(() => {
      // Re-check after preceding append completes — the lock may have been
      // released or TTL-expired while the previous write was in flight,
      // or the outer timeout may have fired (setting abortController.aborted).
      if (lockHolder.released || abortController.aborted) {
        console.warn(`[user:${userId}] Lock released or aborted (chain) — skipping appendMessage(${role})`);
        return;
      }
      if (lockHolder.lockExpiry && Date.now() > lockHolder.lockExpiry - LOCK_SAFETY_MARGIN_MS) {
        console.warn(`[user:${userId}] Lock TTL expired (chain) — skipping appendMessage(${role})`);
        lockHolder.released = true;
        return;
      }
      return appendMessage(user.id, role, text);
    });
    appendChain = p.catch(err => { logger.error({ err: err.message }, `[user:${userId}] appendMessage(${role}) failed`); });
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
  // Retry with exponential back-off up to LOCK_TTL_SECONDS so we can wait
  // out a stale lock left behind by a crashed process (Redis TTL will expire it).
  const LOCK_RETRY_CEILING_MS = LOCK_TTL_SECONDS * 1000;
  const LOCK_RETRY_BASE_MS = 500;
  const LOCK_RETRY_MAX_INTERVAL_MS = 5000;
  let releaseLock;
  let lockWaitElapsed = 0;
  for (let attempt = 0; !releaseLock && lockWaitElapsed < LOCK_RETRY_CEILING_MS; attempt++) {
    releaseLock = await acquireConversationLock(user.id, LOCK_TTL_SECONDS);
    if (releaseLock) break;
    const baseDelay = Math.min(LOCK_RETRY_BASE_MS * Math.pow(2, attempt), LOCK_RETRY_MAX_INTERVAL_MS);
    const delay = Math.round(baseDelay * (0.5 + Math.random()));  // ±50% jitter to prevent thundering herd
    await new Promise(r => setTimeout(r, delay));
    lockWaitElapsed += delay;
  }
  if (!releaseLock) {
    console.warn(`[user:${userId}] Could not acquire conversation lock after ${Math.round(lockWaitElapsed / 1000)}s — concurrent request in progress`);
    return "I'm still working on your previous message — please wait a moment.";
  }

  try {
  // If the outer timeout already fired while we were waiting for the lock,
  // release it immediately rather than doing any more work.
  if (abortController.aborted) {
    console.warn(`[user:${userId}] Aborted during lock acquisition — releasing lock immediately`);
    releaseLock().catch(e => logger.error({ err: e.message }, `[user:${userId}] Failed to release lock after abort`));
    return "Sorry, that took too long. Please try again.";
  }

  // Track when the Redis lock will auto-expire so safeAppend can refuse
  // writes once the lock is no longer guaranteed to be held.
  lockHolder.lockExpiry = Date.now() + (LOCK_TTL_SECONDS * 1000);
  // Expose lock to caller so it can force-release on outer timeout
  lockHolder.releaseLock = releaseLock;

  // Skip Composio calls when tools are disabled (orphan backpressure) to avoid
  // hitting a potentially slow/down Composio API that caused the orphans.
  const [history, allTools, connectionStatus] = await Promise.all([
    getConversationHistory(user.id),
    toolsDisabled ? Promise.resolve([]) : getTools(userId),
    toolsDisabled ? Promise.resolve({ connected: [] }) : getConnectionStatus(userId),
  ]);

  // Build a set of apps the user has actively connected — used to block
  // tool execution for unconnected apps before any Composio API call.
  const connectedApps = new Set((connectionStatus.connected || []).map(a => a.toLowerCase()));

  // Append user message immediately so it's sequenced before any LLM work.
  // This ensures cache path and main path both have the message persisted atomically.
  await safeAppend('user', messageText);

  // When toolsDisabled is set (orphan limit reached), pass no tools to the LLM.
  // This lets the user still get text responses without creating new orphan-
  // producing tool calls, breaking the reject→retry→more-orphans DoS cycle.
  const selectedTools = toolsDisabled ? [] : selectToolsForMessage(allTools, messageText);
  const tools = toolsDisabled ? [] : [...LOCAL_TOOLS, ...selectedTools];
  // Build allowlist of tool names the LLM is permitted to call this turn
  const allowedToolNames = new Set(tools.map(t => t.function?.name?.toUpperCase()).filter(Boolean));
  // Build a map of tool name → parameter schema for argument validation
  const toolSchemas = new Map();
  for (const t of tools) {
    const name = t.function?.name;
    const params = t.function?.parameters;
    if (name && params) toolSchemas.set(name, params);
  }
  // Local tools bypass Composio connection checks
  const localToolNames = new Set(LOCAL_TOOLS.map(t => t.function?.name).filter(Boolean));
  if (toolsDisabled) {
    console.log(`[user:${userId}] Tools disabled (orphan backpressure) — text-only mode`);
  } else {
    console.log(`[user:${userId}] Tools: ${tools.length}/${allTools.length}`);
  }

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
  // Defense-in-depth: strip any history messages with disallowed roles
  // even though redis.js already sanitizes on load, and sanitize user
  // messages in history (stored raw before this fix was deployed).
  const safeHistory = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => m.role === 'user' ? { ...m, content: sanitizeUserMessage(m.content) } : m);
  // Sanitize user message to neutralize prompt injection patterns (role
  // switching, fake tool responses, system-prompt overrides) before the
  // LLM sees it.  The raw text is already persisted via safeAppend above.
  const sanitizedMessage = sanitizeUserMessage(messageText);
  // Trim history so total tokens (system prompt + history + current message)
  // stay within budget, leaving room for the LLM response.
  const systemPromptTokens = estimateTokens(systemPrompt);
  const currentMessageTokens = estimateTokens(sanitizedMessage);
  const trimmedHistory = trimHistoryToTokenBudget(safeHistory, systemPromptTokens, currentMessageTokens);
  const messages = [...trimmedHistory, { role: 'user', content: sanitizedMessage }];

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
    // Shared AbortController for this iteration — aborted on iteration timeout
    // so in-flight tool HTTP requests are cancelled, not just ignored.
    const iterationAC = new AbortController();
    // Propagate outer abort to this iteration's controller so that in-flight
    // tool HTTP requests (e.g. Composio side-effecting calls) are cancelled
    // immediately when the request-level timeout fires, not just ignored.
    const onOuterAbort = () => { if (!iterationAC.signal.aborted) iterationAC.abort(); };
    abortController.onAbort(onOuterAbort);

    const iterationWork = async () => {
    for (const block of response.toolUseBlocks) {
      // Check abort before each tool — prevents executing further tools
      // (especially side-effecting ones) after the request has timed out
      throwIfAborted(abortController, `tool:${block.name}`);
      if (iterationAC.signal.aborted) throw new AbortError(`Iteration aborted before tool:${block.name}`);

      let result;
      try {
        // Validate tool name against allowlist — reject anything the LLM
        // was not offered this turn (guards against prompt injection)
        if (!allowedToolNames.has(block.name?.toUpperCase())) {
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

        // Validate tool-call arguments against the tool's parameter schema
        // to prevent prompt injection from passing attacker-chosen arguments
        const argSchema = toolSchemas.get(block.name);
        const argError = validateToolArgs(block.input, argSchema);
        if (argError) {
          console.warn(`[user:${userId}] Blocked invalid args for ${block.name}: ${argError}`);
          result = { error: `Invalid arguments for "${block.name}": ${argError}` };
          completedToolIds.add(block.id);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
          continue;
        }

        // Validate payload size to prevent memory exhaustion from oversized inputs
        const sizeError = validateToolInputSize(block.input);
        if (!sizeError) {
          // Also check total serialized size as a final safeguard
          const serialized = JSON.stringify(block.input);
          if (serialized && serialized.length > MAX_TOOL_INPUT_BYTES) {
            const bytesErr = `serialized input exceeds maximum size (${MAX_TOOL_INPUT_BYTES} bytes)`;
            console.warn(`[user:${userId}] Blocked oversized input for ${block.name}: ${bytesErr}`);
            result = { error: `Invalid input for "${block.name}": ${bytesErr}` };
            completedToolIds.add(block.id);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
            continue;
          }
        }
        if (sizeError) {
          console.warn(`[user:${userId}] Blocked oversized input for ${block.name}: ${sizeError}`);
          result = { error: `Invalid input for "${block.name}": ${sizeError}` };
          completedToolIds.add(block.id);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
          continue;
        }

        // Verify the user has an active connection for this app before
        // executing — prevents prompt injection from triggering actions on
        // apps the user never authorized.  Local tools (e.g. CREATE_WORKFLOW)
        // are exempt since they don't go through Composio.
        if (!localToolNames.has(block.name)) {
          const app = appFromToolName(block.name);
          if (!connectedApps.has(app)) {
            console.warn(`[user:${userId}] Blocked tool call for unconnected app: ${block.name} (app: ${app})`);
            const link = await getConnectionLink(userId, app).catch(() => null);
            const connectMsg = link
              ? `[${app} is not connected. Please connect it first: ${link}]`
              : `[${app} is not connected. Please connect it at composio.dev before using this tool.]`;
            result = { error: connectMsg };
            completedToolIds.add(block.id);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
            continue;
          }
        }

        // Before executing a side-effecting tool, check if a prior timed-out
        // invocation with the same args has since completed in the background.
        // This prevents duplicate actions when the LLM retries despite the
        // "do NOT retry" instruction.
        if (SIDE_EFFECT_PATTERNS.test(block.name)) {
          const priorOutcome = await _getInflightOutcome(userId, block.name, block.input);
          if (priorOutcome && priorOutcome.status === 'completed') {
            console.warn(`[user:${userId}] Suppressing retry of ${block.name} — prior inflight call already completed`);
            result = priorOutcome.result || { success: true, note: 'Action already completed (from prior timed-out call).' };
            completedToolIds.add(block.id);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
            continue;
          } else if (priorOutcome && priorOutcome.status === 'pending') {
            console.warn(`[user:${userId}] Suppressing retry of ${block.name} — prior call still in-flight`);
            result = { error: `A prior call to ${block.name} is still in-flight. Do NOT retry — the action may complete shortly.` };
            completedToolIds.add(block.id);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
            continue;
          }
        }

        // Re-check abort immediately before creating the tool execution
        // promise — closes the window where the outer timeout fires between
        // the loop-top check and the actual executeTool/planAndCreateWorkflows
        // call, preventing side-effecting promises from launching post-abort.
        throwIfAborted(abortController, `tool-exec:${block.name}`);

        if (block.name === 'CREATE_WORKFLOW') {
          const workflows = await withTimeout(
            planAndCreateWorkflows(user, block.input.description),
            TOOL_EXEC_TIMEOUT, `CREATE_WORKFLOW`
          );
          const workflowWarnings = workflows.flatMap(w => w.warnings || []);
          result = { success: true, workflows: workflows.map(w => ({ id: w.id, name: w.name })) };
          if (workflowWarnings.length > 0) {
            result.warnings = workflowWarnings;
          }
        } else {
          console.log(`[user:${userId}] Tool: ${block.name}`);
          // Each tool gets its own AbortController for its per-tool timeout,
          // but also listens to the iteration-level controller so that an
          // iteration timeout aborts in-flight tool HTTP requests.
          const toolAC = new AbortController();
          // If iteration is aborted, propagate to this tool's controller
          const onIterAbort = () => toolAC.abort();
          iterationAC.signal.addEventListener('abort', onIterAbort, { once: true });
          const { result: toolResult } = await execWithTimeout(
            executeTool(userId, block, { signal: toolAC.signal }),
            TOOL_EXEC_TIMEOUT, `tool:${block.name}`,
            { controller: toolAC }
          ).finally(() => {
            iterationAC.signal.removeEventListener('abort', onIterAbort);
          });
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
        logger.error({ err: err.message }, `[user:${userId}] Tool failed [${block.name}]`);

        // Timeout on a side-effecting tool — the underlying call is still
        // in-flight and may succeed. Tell the LLM NOT to retry.
        if (err.timedOut && SIDE_EFFECT_PATTERNS.test(block.name)) {
          console.warn(`[user:${userId}] Side-effecting tool ${block.name} timed out — suppressing retry`);

          // Check if a prior invocation with the same args already completed.
          const prior = await _getInflightOutcome(userId, block.name, block.input);
          if (prior && prior.status === 'completed') {
            console.warn(`[user:${userId}] Prior inflight ${block.name} already completed — returning cached result`);
            result = prior.result || { success: true, note: 'Action completed (late arrival from prior timeout).' };
          } else if (prior && prior.status === 'failed') {
            result = { error: prior.error || 'Action failed after prior timeout.' };
          } else {
            // Best-effort: wait briefly for late completion so we can give a definitive answer
            const late = await Promise.race([
              err.completionPromise,
              new Promise(resolve => setTimeout(() => resolve(null), 2000)),
            ]);
            if (late && late.successful !== false) {
              result = late;
            } else {
              // Persist the in-flight state so we track eventual completion.
              await _trackInflightOutcome(userId, block.name, block.input, err.completionPromise);
              result = { error: `Tool timed out but the action (${block.name}) may have already been executed. Do NOT retry this call — inform the user the action is pending and may complete shortly.` };
            }
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

    const removeOuterListener = () => {
      const idx = abortController._listeners.indexOf(onOuterAbort);
      if (idx !== -1) abortController._listeners.splice(idx, 1);
    };
    try {
      await withTimeout(iterationWork(), ITERATION_TIMEOUT, `iteration ${iterations + 1}`);
      removeOuterListener();
    } catch (iterErr) {
      removeOuterListener();
      // AbortError must propagate — the request is cancelled, don't continue the loop
      if (iterErr.name === 'AbortError' && abortController.aborted) throw iterErr;
      // Iteration timed out — abort in-flight tool calls and generate error
      // results for tools that didn't finish so the LLM gets complete context.
      if (!iterationAC.signal.aborted) iterationAC.abort();
      console.warn(`[user:${userId}] Iteration ${iterations + 1} timed out: ${iterErr.message}`);
      for (const block of response.toolUseBlocks) {
        if (!completedToolIds.has(block.id)) {
          const hasSideEffects = SIDE_EFFECT_PATTERNS.test(block.name);
          if (hasSideEffects) {
            // Track the in-flight side-effecting tool so we know if it
            // eventually completes.  iterErr.completionPromise covers the
            // whole iteration; individual tool promises are not available
            // here, so we record the pending state for dedup purposes.
            await _trackInflightOutcome(userId, block.name, block.input, iterErr.completionPromise || null);
          }
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

  // If the loop exited because MAX_TOOL_ITERATIONS was reached, the last
  // tool results are in `messages` but the LLM never processed them.  Make
  // one final LLM call *without tools* so it can summarise the results for
  // the user instead of returning a truncated fragment or fallback.
  //
  // Before the final LLM call, build a condensed summary of all tool
  // interactions so we can persist it to conversation history.  Without
  // this, the next user message would lack the context of what tools were
  // called and what they returned, causing the LLM to repeat tool calls
  // or give incorrect answers.
  let toolContextSummary = '';
  if (!completed && iterations > 0) {
    const summaryParts = [];
    // Walk the in-memory messages array (after the original history + user
    // message) to extract assistant tool calls and their results.
    const loopMessages = messages.slice(safeHistory.length + 1);
    for (const msg of loopMessages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            summaryParts.push(`[Assistant]: ${part.text}`);
          } else if (part.name) {
            // tool_use block
            const argSnippet = JSON.stringify(part.input || {}).slice(0, 200);
            summaryParts.push(`[Tool Call]: ${part.name}(${argSnippet})`);
          }
        }
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool_result') {
            const resultSnippet = typeof part.content === 'string'
              ? part.content.slice(0, 300)
              : JSON.stringify(part.content).slice(0, 300);
            summaryParts.push(`[Tool Result ${part.tool_use_id}]: ${resultSnippet}`);
          }
        }
      }
    }
    if (summaryParts.length > 0) {
      toolContextSummary = '\n\n[Prior tool context from this request — iteration limit reached]\n' +
        summaryParts.join('\n');
    }
  }

  if (!completed && !abortController.aborted) {
    console.warn(`[user:${userId}] Hit MAX_TOOL_ITERATIONS (${MAX_TOOL_ITERATIONS}), making final summarisation LLM call`);
    try {
      throwIfAborted(abortController, 'final LLM call');
      const finalResponse = await withTimeout(
        callLLM(systemPrompt, messages, [], { alreadyOpenAIFormat: true }),
        LLM_ITERATION_TIMEOUT, 'final LLM call (post-iteration-limit)'
      );
      if (finalResponse?.text) response = finalResponse;
    } catch (err) {
      console.warn(`[user:${userId}] Final summarisation LLM call failed: ${err.message}`);
    }
  }

  const finalText = response?.text || (completed
    ? 'Done! Let me know if you need anything else.'
    : "Sorry, I couldn't finish processing that. Please try again.");

  // Append tool context summary to the persisted assistant message so the
  // next conversation turn retains awareness of what tools were called.
  const persistedText = toolContextSummary
    ? finalText + toolContextSummary
    : finalText;

  // User message was already appended before the LLM call — only persist
  // the assistant reply.  The lock is still held (released in the finally
  // block), so safeAppend is safe here even after abort.
  if (abortController.aborted) {
    console.warn(`[user:${userId}] Request timed out — persisting assistant reply before releasing lock`);
    await safeAppend('assistant', persistedText);
    if (shouldCache(messageText)) releaseCacheLock(messageText, userId).catch(err => { logger.error({ err: err.message }, `[user:${userId}] releaseCacheLock failed`); });
    return finalText;
  }
  await safeAppend('assistant', persistedText);

  // Cache the response if eligible
  if (shouldCache(messageText) && finalText) {
    await setCachedResponse(messageText, finalText, userId);
  }

  // Fire-and-forget: extract memory with AbortController timeout (best-effort, must never crash)
  // Snapshot messages so extraction works on a frozen copy — the live array
  // may be mutated by subsequent requests after the lock is released.
  const MEMORY_EXTRACTION_TIMEOUT = 30000;
  const memoryAC = new AbortController();
  const memoryTimer = setTimeout(() => memoryAC.abort(new Error('memory extraction timed out')), MEMORY_EXTRACTION_TIMEOUT);
  if (memoryTimer.unref) memoryTimer.unref();
  const messagesSnapshot = messages.map(m => ({ ...m }));
  extractAndSaveMemory(user, messagesSnapshot, { signal: memoryAC.signal })
    .finally(() => clearTimeout(memoryTimer))
    .catch(err => { logger.error({ err: err.message }, `[user:${userId}] memory extraction failed`); });

  return finalText;
  } catch (err) {
    // Release stampede lock so other requests aren't blocked for 30s
    if (shouldCache(messageText)) releaseCacheLock(messageText, userId).catch(err => { logger.error({ err: err.message }, `[user:${userId}] releaseCacheLock failed`); });

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
      await safeAppend('assistant', rateLimitMsg)
        .catch(e => logger.error({ err: e.message }, `[user:${userId}] Rate-limit history persist failed`));
      return rateLimitMsg;
    }
    if (err.message && /timed? ?out|abort/i.test(err.message)) {
      await safeAppend('assistant', "Sorry, that took too long. Please try again.")
        .catch(e => logger.error({ err: e.message }, `[user:${userId}] Timeout history persist failed`));
      return "Sorry, that took too long. Please try again.";
    }
    // Any other LLM/service failure — persist error response so the user's
    // message doesn't appear unanswered on retry or app restart.
    logger.error({ err: err.message }, `[user:${userId}] Unhandled LLM error`);
    const errorMsg = "Something went wrong on my end. Please try again.";
    await safeAppend('assistant', errorMsg)
      .catch(e => logger.error({ err: e.message }, `[user:${userId}] Error history persist failed`));
    return errorMsg;
  } finally {
    // Always drain in-flight appends regardless of who set `released`.
    // Without this, when the reap timer or orphan settlement sets released=true
    // while an append is mid-flight, the finally block would skip draining,
    // leaving a Redis write racing with the next request's writes after TTL expiry.
    if (lockHolder.inflightAppend) {
      await lockHolder.inflightAppend.catch(e => logger.error({ err: e.message }, `[user:${userId}] Inflight append failed`));
    }
    if (releaseLock) {
      lockHolder.released = true;
      // Only explicitly release if the TTL hasn't expired — if it has,
      // Redis already removed the key and a new request may hold the lock.
      // Calling release on an expired lock could delete the NEW lock key.
      if (lockHolder.lockExpiry && Date.now() < lockHolder.lockExpiry) {
        await releaseLock().catch(e => logger.error({ err: e.message }, `[user:${userId}] Failed to release conversation lock`));
      } else {
        console.warn(`[user:${userId}] Lock TTL expired — skipping explicit release to avoid deleting a newer lock`);
      }
    }
  }
}

module.exports = { processMessage, getOrphanedCount };

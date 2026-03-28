const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../services/logger');
const { provider, PROVIDER, TwilioProvider, TelnyxProvider } = require('../services/messaging');
const { getOrCreateUserByPhone } = require('../db/queries');
const { appendMessage, deduplicateAndEnqueue, drainSMSQueue, acquireConversationLock, redis } = require('../services/redis');

const router = express.Router();

// Replay protection: reject webhooks older than this window (seconds)
const WEBHOOK_TIMESTAMP_TOLERANCE = 300; // 5 minutes

// SMS webhook rate limit: 20 requests per minute per phone number
const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many SMS requests.' } },
  keyGenerator: (req) => {
    // Twilio sends From in form-urlencoded body; Telnyx nests it in JSON
    const phone = req.body?.From || req.body?.data?.payload?.from?.phone_number || req.ip;
    return phone.replace(/[^\d+]/g, '');
  },
});

router.get('/sms', (req, res) => res.status(200).send('OK'));

// Twilio sends form-urlencoded; Telnyx sends JSON — handle both
// Compute the dedup key the same way deduplicateAndEnqueue does internally,
// so we can clear it on failure to allow provider retries.
function computeDedupKey(msgId, phone, messageText) {
  if (msgId) return `sms:dedup:${msgId}`;
  const crypto = require('crypto');
  const bucket = Math.floor(Date.now() / 5000);
  const hash = crypto.createHash('sha256').update(`${phone}:${messageText}:${bucket}`).digest('hex').slice(0, 16);
  return `sms:dedup:content:${hash}`;
}

router.post('/sms', express.urlencoded({ extended: false }), smsLimiter, async (req, res) => {
  let dedupKey = null; // track so we can clear on failure to allow provider retries
  try {
    const isTwilio = !!req.body?.MessageSid;

    if (isTwilio) {
      // --- Twilio path ---
      // Use a Twilio-specific provider for validation/parsing regardless of
      // which PROVIDER env var was set at startup.  This prevents a provider
      // switch (e.g. twilio→telnyx) from routing Twilio webhooks through the
      // wrong signature validator, which would silently drop every message.
      const twilioProvider = new TwilioProvider();
      // Always verify webhook signatures in production, even if PROVIDER=stub
      // (misconfigured prod must not silently skip verification).
      // In non-production, skip verification only when explicitly using stub provider.
      const skipTwilioVerify = PROVIDER === 'stub' && ['development', 'test'].includes(process.env.NODE_ENV);
      if (!skipTwilioVerify) {
        if (!req.headers['x-twilio-signature']) {
          console.warn('[security] Missing x-twilio-signature header');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        const isValid = twilioProvider.validateIncoming(req);
        if (!isValid) {
          console.warn('[security] Invalid Twilio signature');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }

        // Replay protection: Twilio has no timestamp header, so we rely on
        // MessageSid as a nonce.  Reject requests without one — the dedup
        // layer below will block any replayed SID within the 300s TTL window.
        if (!req.body?.MessageSid) {
          console.warn('[security] Twilio webhook missing MessageSid nonce');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
      }

      const parsed = twilioProvider.parseIncoming(req.body);
      const phone = parsed.from;
      const messageText = parsed.body;
      const msgId = parsed.messageId;

      if (!phone || !messageText) {
        return res.status(400).json({ error: { code: 'WEBHOOK_VALIDATION_ERROR', message: 'Missing phone or message text' } });
      }

      if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
        return res.status(400).json({ error: { code: 'WEBHOOK_VALIDATION_ERROR', message: 'Invalid phone number format' } });
      }

      if (messageText.length > 1600) {
        return res.status(400).json({ error: { code: 'WEBHOOK_VALIDATION_ERROR', message: 'Message too long' } });
      }

      // Atomic dedup + enqueue: eliminates TOCTOU gap between dedup check and enqueue
      const isNew = await deduplicateAndEnqueue(msgId, phone, messageText, Date.now());
      if (!isNew) return res.status(200).send('<Response></Response>');
      dedupKey = computeDedupKey(msgId, phone, messageText);

      await handleIncomingSMS(phone, messageText, res, true);
    } else {
      // --- Telnyx path ---
      // Use a Telnyx-specific provider for validation regardless of startup
      // PROVIDER value — mirrors the Twilio fix above.
      const telnyxProvider = new TelnyxProvider();
      const skipTelnyxVerify = PROVIDER === 'stub' && ['development', 'test'].includes(process.env.NODE_ENV);
      if (!skipTelnyxVerify) {
        if (!req.headers['telnyx-signature-ed25519-signature']) {
          console.warn('[security] Missing telnyx-signature-ed25519-signature header');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        const rawBody = req.rawBody;
        if (!rawBody) {
          console.warn('[security] Missing rawBody for Telnyx signature verification');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        const isValid = telnyxProvider.validateIncoming(rawBody, req.headers);
        if (!isValid) {
          console.warn('[security] Invalid Telnyx signature');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }

        // Replay protection: reject webhooks with stale or missing timestamps
        const telnyxTimestamp = req.headers['telnyx-timestamp'];
        if (!telnyxTimestamp) {
          console.warn('[security] Missing telnyx-timestamp header');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        const webhookAge = Math.abs(Date.now() / 1000 - Number(telnyxTimestamp));
        if (isNaN(webhookAge) || webhookAge > WEBHOOK_TIMESTAMP_TOLERANCE) {
          console.warn('[security] Telnyx webhook timestamp outside tolerance window');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
      }

      const event = req.body?.data;
      if (!event || event.event_type !== 'message.received') {
        return res.status(200).json({});
      }

      const msgId = event.payload?.id;
      const payload = event.payload;
      const phone = payload?.from?.phone_number;
      const messageText = payload?.text;

      if (!phone || !messageText) {
        return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'Missing phone or text' } });
      }

      if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
        return res.status(400).json({ error: { code: 'INVALID_PHONE', message: 'Invalid phone number format' } });
      }

      if (messageText.length > 1600) {
        return res.status(400).json({ error: { code: 'MESSAGE_TOO_LONG', message: 'Message too long' } });
      }

      // Atomic dedup + enqueue: eliminates TOCTOU gap between dedup check and enqueue
      const isNew = await deduplicateAndEnqueue(msgId, phone, messageText, Date.now());
      if (!isNew) return res.sendStatus(200);
      dedupKey = computeDedupKey(msgId, phone, messageText);

      await handleIncomingSMS(phone, messageText, res, false);
    }
  } catch (err) {
    const isRetriable = err.code === 'ECONNREFUSED'
      || err.code === 'ENOTFOUND'
      || err.code === 'ETIMEDOUT'
      || err.code === 'EAI_AGAIN'
      || (err.message && /database|pg|redis|ECONNRESET/i.test(err.message));
    const code = isRetriable ? 'SERVICE_UNAVAILABLE'
      : err.name === 'JsonWebTokenError' ? 'AUTH_ERROR'
      : 'WEBHOOK_ERROR';
    const status = isRetriable ? 503 : 500;
    logger.error({ err: err.message, code }, 'SMS webhook error');
    // Clear the dedup key so the provider's retry can reprocess the message
    // instead of being silently deduplicated with a 200 response.
    if (dedupKey) {
      try { await redis.del(dedupKey); } catch (_) { /* best-effort */ }
    }
    res.status(status).json({ error: { code, message: 'Internal server error' } });
  }
});

// Lock TTL (seconds) — Redis auto-expires the key if the holder crashes.
const LOCK_TTL_SECONDS = 120;
// Maximum time (ms) to wait for the per-user conversation lock before giving up.
// Must exceed LOCK_TTL_SECONDS so a stale lock from a crashed process
// can be waited out rather than causing persistent failures.
const LOCK_WAIT_MS = (LOCK_TTL_SECONDS + 10) * 1000; // TTL + 10s buffer
const LOCK_POLL_BASE_MS = 500;
const LOCK_POLL_MAX_MS = 4000;

async function handleIncomingSMS(phone, messageText, res, isTwilio) {
  const respond = (status) => {
    if (isTwilio) return res.status(status).send('<Response></Response>');
    return res.status(status).json({});
  };

  const { user, created: isNewUser } = await getOrCreateUserByPhone(phone);

  // Message was already atomically enqueued by deduplicateAndEnqueue() —
  // no separate enqueueSMS call needed, eliminating the TOCTOU gap.

  // --- Acquire the per-user conversation lock (wait with exponential back-off + jitter) ---
  let release;
  let attempt = 0;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!release && Date.now() < deadline) {
    release = await acquireConversationLock(user.id, LOCK_TTL_SECONDS);
    if (!release) {
      const baseDelay = Math.min(LOCK_POLL_BASE_MS * Math.pow(2, attempt), LOCK_POLL_MAX_MS);
      const delay = Math.round(baseDelay * (0.5 + Math.random()));  // ±50% jitter to prevent thundering herd
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  if (!release) {
    // Another handler has the lock and will drain our queued message
    logger.warn({ phone }, '[sms] Lock wait timeout — message queued for processing by lock holder');
    return respond(200);
  }

  try {
    // --- Drain the queue in FIFO order (sorted by arrival timestamp) ---
    const queued = await drainSMSQueue(phone);
    // Sort by timestamp to guarantee FIFO even if Redis list order was perturbed
    queued.sort((a, b) => a.ts - b.ts);

    for (const msg of queued) {
      await processSingleSMS(phone, msg.text, user, isNewUser);
    }
  } finally {
    await release();
  }

  return respond(200);
}

/**
 * Process a single SMS message for a user.  Called inside the conversation
 * lock so messages are handled strictly in FIFO order.
 */
async function processSingleSMS(phone, messageText, user, isNewUser) {
  // Check for pending workflow replies (atomic claim prevents duplicate processing on concurrent webhooks)
  const { claimPendingReplyForUser, unclaimPendingReply, getWorkflowRun, getWorkflowById } = require('../db/queries');
  const pendingReply = await claimPendingReplyForUser(user.id, messageText);
  if (pendingReply) {
    // Validate the run still exists and is in a resumable state before attempting resume
    const run = await getWorkflowRun(pendingReply.run_id);
    if (!run || !['waiting', 'delayed'].includes(run.status)) {
      const reason = !run ? 'run no longer exists' : `run is in '${run.status}' state`;
      logger.warn({ run_id: pendingReply.run_id, reason }, '[sms] Pending reply references stale workflow run');
      const staleMsg = 'That workflow is no longer active, so your reply couldn\'t be processed. You can start a new workflow if needed.';
      await provider.sendMessage(phone, staleMsg);
      await appendMessage(user.id, 'user', messageText);
      await appendMessage(user.id, 'assistant', staleMsg);
      return;
    }

    // Validate the parent workflow still exists (may have been deleted via CASCADE)
    const workflow = await getWorkflowById(run.workflow_id);
    if (!workflow) {
      logger.warn({ run_id: pendingReply.run_id, workflow_id: run.workflow_id }, '[sms] Workflow deleted while reply was pending');
      const deletedMsg = 'The workflow this reply was for has been deleted. Your reply couldn\'t be processed.';
      await provider.sendMessage(phone, deletedMsg);
      await appendMessage(user.id, 'user', messageText);
      await appendMessage(user.id, 'assistant', deletedMsg);
      return;
    }

    const { resumeWorkflowRun } = require('../services/workflow-agent');
    try {
      await resumeWorkflowRun(pendingReply.run_id, messageText);
    } catch (err) {
      try { await unclaimPendingReply(pendingReply.id); } catch (_) { /* best-effort */ }
      logger.error({ err: err.message }, '[sms] Workflow resume error');
      const failMsg = 'Sorry, something went wrong resuming your workflow. Please try again.';
      await provider.sendMessage(phone, failMsg);
      await appendMessage(user.id, 'assistant', failMsg);
      return;
    }
    await appendMessage(user.id, 'user', messageText);
    await provider.sendMessage(phone, 'Got it! Processing your reply...');
    await appendMessage(user.id, 'assistant', 'Got it! Processing your reply...');
    return;
  }

  // New user discovery — use atomic Redis flag to prevent duplicate sends
  if (isNewUser || !user.preferences?.onboarded) {
    const { redis } = require('../services/redis');
    const claimKey = `discovery:sent:${user.id}`;
    const claimed = await redis.set(claimKey, '1', 'NX', 'EX', 600);
    if (claimed === 'OK') {
      await appendMessage(user.id, 'user', messageText);
      const discoveryMsg =
        'Hey! I\'m Wingman 🐦 — your personal AI.\n' +
        'Get set up in 30 seconds:\n' +
        'https://wingman.app/start\n\n' +
        '(or just keep texting me here!)';
      await provider.sendMessage(phone, discoveryMsg);
      await appendMessage(user.id, 'assistant', discoveryMsg);
      const { updateUserPreferences } = require('../db/queries');
      await updateUserPreferences(user.id, { onboarded: false, discoverySmsSent: true });
      return;
    }
    await appendMessage(user.id, 'user', messageText);
    return;
  }

  // Process through orchestrator
  let responseText;
  try {
    const orchestrator = require('../services/orchestrator');
    responseText = await orchestrator.processMessage(user, messageText);
  } catch (err) {
    logger.error({ err: err.message }, 'Orchestrator error');
    const fallbackMsg = 'Sorry, I hit a snag processing your message. Please try again in a moment.';
    const results = await Promise.allSettled([
      appendMessage(user.id, 'user', messageText),
      appendMessage(user.id, 'assistant', fallbackMsg),
      provider.sendMessage(phone, fallbackMsg),
    ]);
    if (results[0].status === 'rejected') {
      logger.error({ err: results[0].reason?.message, userId: user.id }, '[sms] Failed to append user message to conversation history');
    }
    if (results[1].status === 'rejected') {
      logger.error({ err: results[1].reason?.message, userId: user.id }, '[sms] Failed to append assistant fallback message to conversation history');
    }
    const sendResult = results[2];
    if (sendResult.status === 'rejected') {
      logger.error({ err: sendResult.reason?.message, phone }, '[sms] Failed to send error-notification SMS — user was not notified');
      // Throw so the caller returns 500/503, prompting the provider to retry the webhook
      throw sendResult.reason;
    }
    return;
  }

  try {
    await provider.sendMessage(phone, responseText);
  } catch (sendErr) {
    logger.error({ err: sendErr.message, phone }, '[sms] Failed to send orchestrator reply — user was not notified');
    // Re-throw so the webhook returns non-200 and the provider can retry
    throw sendErr;
  }
}

module.exports = router;

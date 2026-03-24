const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../services/logger');
const { provider, PROVIDER, TwilioProvider, TelnyxProvider } = require('../services/messaging');
const { getOrCreateUserByPhone } = require('../db/queries');
const { appendMessage, deduplicateMessage } = require('../services/redis');

const router = express.Router();

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
router.post('/sms', express.urlencoded({ extended: false }), smsLimiter, async (req, res) => {
  try {
    const isTwilio = !!req.body?.MessageSid;

    if (isTwilio) {
      // --- Twilio path ---
      // Use a Twilio-specific provider for validation/parsing regardless of
      // which PROVIDER env var was set at startup.  This prevents a provider
      // switch (e.g. twilio→telnyx) from routing Twilio webhooks through the
      // wrong signature validator, which would silently drop every message.
      const twilioProvider = new TwilioProvider();
      if (PROVIDER !== 'stub') {
        if (!req.headers['x-twilio-signature']) {
          console.warn('[security] Missing x-twilio-signature header');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        const isValid = twilioProvider.validateIncoming(req);
        if (!isValid) {
          console.warn('[security] Invalid Twilio signature');
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

      // Idempotency — atomic dedup with content-based fallback when msgId is absent
      const isNew = await deduplicateMessage(msgId, phone, messageText);
      if (!isNew) return res.status(200).send('<Response></Response>');

      await handleIncomingSMS(phone, messageText, res, true);
    } else {
      // --- Telnyx path ---
      // Use a Telnyx-specific provider for validation regardless of startup
      // PROVIDER value — mirrors the Twilio fix above.
      const telnyxProvider = new TelnyxProvider();
      if (PROVIDER !== 'stub') {
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

      // Idempotency — atomic dedup with content-based fallback when msgId is absent
      const isNew = await deduplicateMessage(msgId, phone, messageText);
      if (!isNew) return res.sendStatus(200);

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
    res.status(status).json({ error: { code, message: 'Internal server error' } });
  }
});

async function handleIncomingSMS(phone, messageText, res, isTwilio) {
  const respond = (status) => {
    if (isTwilio) return res.status(status).send('<Response></Response>');
    return res.status(status).json({});
  };

  const { user, created: isNewUser } = await getOrCreateUserByPhone(phone);

  // Check for pending workflow replies (atomic claim prevents duplicate processing on concurrent webhooks)
  const { claimPendingReplyForUser } = require('../db/queries');
  const pendingReply = await claimPendingReplyForUser(user.id, messageText);
  if (pendingReply) {
    const { resumeWorkflowRun } = require('../services/workflow-agent');
    await appendMessage(user.id, 'user', messageText);
    await provider.sendMessage(phone, 'Got it! Processing your reply...');
    await appendMessage(user.id, 'assistant', 'Got it! Processing your reply...');
    try {
      await resumeWorkflowRun(pendingReply.run_id, messageText);
    } catch (err) {
      logger.error({ err: err.message }, '[sms] Workflow resume error');
      const failMsg = 'Sorry, something went wrong resuming your workflow. Please try again.';
      await provider.sendMessage(phone, failMsg);
      await appendMessage(user.id, 'assistant', failMsg);
    }
    return respond(200);
  }

  // New user discovery
  if (isNewUser || !user.preferences?.onboarded) {
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
    return respond(200);
  }

  // Process through orchestrator
  let responseText;
  try {
    const orchestrator = require('../services/orchestrator');
    responseText = await orchestrator.processMessage(user, messageText);
  } catch (err) {
    logger.error({ err: err.message }, 'Orchestrator error');
    responseText = 'Sorry, I hit a snag processing your message. Please try again in a moment.';
    // Orchestrator failed before persisting — save messages here
    await appendMessage(user.id, 'user', messageText).catch(e => logger.error({ err: e.message }, `[sms] Failed to persist user message for user ${user.id}`));
    await appendMessage(user.id, 'assistant', responseText).catch(e => logger.error({ err: e.message }, `[sms] Failed to persist assistant message for user ${user.id}`));
  }

  // Orchestrator already persists user + assistant messages atomically
  await provider.sendMessage(phone, responseText);
  return respond(200);
}

module.exports = router;

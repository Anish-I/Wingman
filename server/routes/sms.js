const express = require('express');
const rateLimit = require('express-rate-limit');
const { provider } = require('../services/messaging');
const { getOrCreateUserByPhone } = require('../db/queries');
const { appendMessage, redis } = require('../services/redis');

const router = express.Router();

// SMS webhook rate limit: 20 requests per minute
const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many SMS requests.' } },
});

router.get('/sms', (req, res) => res.status(200).send('OK'));

// Twilio sends form-urlencoded; Telnyx sends JSON — handle both
router.post('/sms', express.urlencoded({ extended: false }), smsLimiter, async (req, res) => {
  try {
    const isTwilio = !!req.body?.MessageSid;

    if (isTwilio) {
      // --- Twilio path ---
      if (process.env.NODE_ENV !== 'production' && !req.headers['x-twilio-signature']) {
        console.warn('[security] WARNING: Twilio signature check skipped in development mode — do NOT use in production');
      } else {
        if (!req.headers['x-twilio-signature']) {
          console.warn('[security] Missing x-twilio-signature header');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        const isValid = provider.validateIncoming(req);
        if (!isValid) {
          console.warn('[security] Invalid Twilio signature');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
      }

      const parsed = provider.parseIncoming(req.body);
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

      // Idempotency
      if (msgId) {
        const dedupKey = `sms:dedup:${msgId}`;
        const isNew = await redis.set(dedupKey, '1', 'NX', 'EX', 300);
        if (!isNew) return res.status(200).send('<Response></Response>');
      }

      await handleIncomingSMS(phone, messageText, res, true);
    } else {
      // --- Telnyx path ---
      if (process.env.NODE_ENV !== 'production' && !req.headers['telnyx-signature-ed25519-signature']) {
        console.warn('[security] WARNING: Telnyx signature check skipped in development mode — do NOT use in production');
      } else {
        if (!req.headers['telnyx-signature-ed25519-signature']) {
          console.warn('[security] Missing telnyx-signature-ed25519-signature header');
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        const rawBody = JSON.stringify(req.body);
        const isValid = provider.validateIncoming(rawBody, req.headers);
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
      if (msgId) {
        const dedupKey = `sms:dedup:${msgId}`;
        const isNew = await redis.set(dedupKey, '1', 'NX', 'EX', 300);
        if (!isNew) return res.sendStatus(200);
      }

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

      await handleIncomingSMS(phone, messageText, res, false);
    }
  } catch (err) {
    const code = err.code === 'ECONNREFUSED' ? 'SERVICE_UNAVAILABLE'
      : err.name === 'JsonWebTokenError' ? 'AUTH_ERROR'
      : 'WEBHOOK_ERROR';
    console.error(`SMS webhook error [${code}]:`, err);
    res.status(200).json({});
  }
});

async function handleIncomingSMS(phone, messageText, res, isTwilio) {
  const respond = (status) => {
    if (isTwilio) return res.status(status).send('<Response></Response>');
    return res.status(status).json({});
  };

  const { user, created: isNewUser } = await getOrCreateUserByPhone(phone);

  await appendMessage(user.id, 'user', messageText);

  // Check for pending workflow replies
  const { getPendingReplyForUser, resolvePendingReply } = require('../db/queries');
  const pendingReply = await getPendingReplyForUser(user.id);
  if (pendingReply) {
    await resolvePendingReply(pendingReply.id, messageText);
    const { resumeWorkflowRun } = require('../services/workflow-agent');
    await provider.sendMessage(phone, 'Got it! Processing your reply...');
    await appendMessage(user.id, 'assistant', 'Got it! Processing your reply...');
    try {
      await resumeWorkflowRun(pendingReply.run_id, messageText);
    } catch (err) {
      console.error('[sms] Workflow resume error:', err.message);
      const failMsg = 'Sorry, something went wrong resuming your workflow. Please try again.';
      await provider.sendMessage(phone, failMsg);
      await appendMessage(user.id, 'assistant', failMsg);
    }
    return respond(200);
  }

  // New user discovery
  if (isNewUser || !user.preferences?.onboarded) {
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
    console.error('Orchestrator error:', err);
    responseText = 'Sorry, I hit a snag processing your message. Please try again in a moment.';
  }

  await appendMessage(user.id, 'assistant', responseText);
  await provider.sendMessage(phone, responseText);
  return respond(200);
}

module.exports = router;

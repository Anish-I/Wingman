const express = require('express');
const rateLimit = require('express-rate-limit');
const { provider } = require('../services/messaging');
const { getUserByPhone, createUser } = require('../db/queries');
const { appendMessage, redis } = require('../services/redis');

const router = express.Router();

// SMS webhook rate limit: 20 requests per minute
const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many SMS requests.',
});

router.get('/sms', (req, res) => res.status(200).send('OK'));

router.post('/sms', smsLimiter, async (req, res) => {
  try {
    // Validate Telnyx signature in production
    if (process.env.NODE_ENV === 'production') {
      const rawBody = JSON.stringify(req.body);
      const isValid = provider.validateIncoming(rawBody, req.headers);
      if (!isValid) {
        console.warn('Invalid Telnyx signature');
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const event = req.body?.data;

    // Only handle inbound messages
    if (!event || event.event_type !== 'message.received') {
      return res.status(200).json({});
    }

    // Idempotency: ignore duplicate webhook deliveries
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
      return res.status(400).json({ error: 'Missing phone or text' });
    }

    // Validate phone is E.164 format
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Limit message text length to prevent abuse
    if (messageText.length > 1600) {
      return res.status(400).json({ error: 'Message too long' });
    }

    // Look up or create user
    let user = await getUserByPhone(phone);
    const isNewUser = !user;
    if (!user) {
      user = await createUser(phone);
    }

    // Store incoming message
    await appendMessage(user.id, 'user', messageText);

    // Check for pending workflow replies before orchestrator
    const { getPendingReplyForUser, resolvePendingReply } = require('../db/queries');
    const pendingReply = await getPendingReplyForUser(user.id);
    if (pendingReply) {
      await resolvePendingReply(pendingReply.id, messageText);
      // Resume the paused workflow
      const { resumeWorkflowRun } = require('../services/workflow-agent');
      resumeWorkflowRun(pendingReply.run_id, messageText).catch(err => {
        console.error('[sms] Workflow resume error:', err.message);
      });
      await provider.sendMessage(phone, 'Got it! Processing your reply...');
      await appendMessage(user.id, 'assistant', 'Got it! Processing your reply...');
      return res.status(200).json({});
    }

    // New user SMS discovery path — send app download link
    if (isNewUser || !user.preferences?.onboarded) {
      const discoveryMsg =
        'Hey! I\'m Wingman 🐦 — your personal AI.\n' +
        'Get set up in 30 seconds:\n' +
        'https://wingman.app/start\n\n' +
        '(or just keep texting me here!)';
      await provider.sendMessage(phone, discoveryMsg);
      await appendMessage(user.id, 'assistant', discoveryMsg);
      // Mark as having seen the discovery message
      const { updateUserPreferences } = require('../db/queries');
      await updateUserPreferences(user.id, { onboarded: false, discoverySmsSent: true });
      return res.status(200).json({});
    }

    // Process message through orchestrator
    let responseText;
    try {
      const orchestrator = require('../services/orchestrator');
      responseText = await orchestrator.processMessage(user, messageText);
    } catch (err) {
      console.error('Orchestrator error:', err);
      responseText = 'Sorry, I hit a snag processing your message. Please try again in a moment.';
    }

    // Store assistant response
    await appendMessage(user.id, 'assistant', responseText);

    // Send response via Telnyx
    await provider.sendMessage(phone, responseText);

    res.status(200).json({});
  } catch (err) {
    console.error('SMS webhook error:', err);
    res.status(200).json({});
  }
});

module.exports = router;

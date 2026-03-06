const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateWebhook, sendSMS } = require('../services/telnyx');
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
      const isValid = validateWebhook(rawBody, req.headers);
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

    // Look up or create user
    let user = await getUserByPhone(phone);
    if (!user) {
      user = await createUser(phone);
      await sendSMS(phone,
        'Welcome to TextFlow! I\'m your personal AI assistant. ' +
        'You can text me to manage your calendar, send emails, set reminders, and more. ' +
        'Reply "HELP" for a list of commands.'
      );
    }

    // Store incoming message
    await appendMessage(user.id, 'user', messageText);

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
    await sendSMS(phone, responseText);

    res.status(200).json({});
  } catch (err) {
    console.error('SMS webhook error:', err);
    res.status(200).json({});
  }
});

module.exports = router;

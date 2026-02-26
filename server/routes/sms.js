const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateWebhook, sendSMS } = require('../services/twilio');
const { getUserByPhone, createUser } = require('../db/queries');
const { appendMessage } = require('../services/redis');

const router = express.Router();

// SMS webhook rate limit: 20 requests per minute
const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many SMS requests.',
});

router.post('/sms', smsLimiter, async (req, res) => {
  try {
    // Validate Twilio signature in production
    if (process.env.NODE_ENV === 'production') {
      const isValid = validateWebhook(req);
      if (!isValid) {
        console.warn('Invalid Twilio signature');
        return res.status(403).send('Forbidden');
      }
    }

    const { From: phone, Body: messageText } = req.body;

    if (!phone || !messageText) {
      return res.status(400).send('Missing From or Body');
    }

    // Look up or create user
    let user = await getUserByPhone(phone);
    if (!user) {
      user = await createUser(phone);
      // Send onboarding message
      await sendSMS(phone,
        'Welcome to TextFlow! I\'m your personal AI assistant. ' +
        'You can text me to manage your calendar, send emails, set reminders, and more. ' +
        'Reply "HELP" for a list of commands.'
      );
    }

    // Store incoming message
    await appendMessage(user.id, 'user', messageText);

    // Process message through orchestrator (imported dynamically to avoid circular deps)
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

    // Send response via SMS
    await sendSMS(phone, responseText);

    // Return TwiML 200 (empty response since we send via API)
    res.set('Content-Type', 'text/xml');
    res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('SMS webhook error:', err);
    res.set('Content-Type', 'text/xml');
    res.status(200).send('<Response></Response>');
  }
});

module.exports = router;

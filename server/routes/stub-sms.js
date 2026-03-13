'use strict';

const express = require('express');
const { provider } = require('../services/messaging');
const { getUserByPhone, createUser } = require('../db/queries');
const { appendMessage, redis } = require('../services/redis');

const router = express.Router();

// POST /stub/sms — simulate an incoming SMS (same flow as Telnyx webhook, no signature validation)
router.post('/sms', async (req, res) => {
  try {
    const { from, body } = req.body;

    if (!from || !body) {
      return res.status(400).json({ error: 'Missing "from" and "body" fields.' });
    }

    // Validate phone is E.164 format
    if (!/^\+[1-9]\d{1,14}$/.test(from)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use E.164 (e.g. +15551234567).' });
    }

    if (body.length > 1600) {
      return res.status(400).json({ error: 'Message too long (max 1600 chars).' });
    }

    // Store inbound message in stub Redis list
    const inboundMsg = {
      from,
      to: process.env.TELNYX_PHONE || '+15550000000',
      body,
      timestamp: Date.now(),
      id: `stub-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    await redis.rpush(`stub:messages:${from}`, JSON.stringify(inboundMsg));
    await redis.expire(`stub:messages:${from}`, 86400);

    // Look up or create user
    let user = await getUserByPhone(from);
    const isNewUser = !user;
    if (!user) {
      user = await createUser(from);
    }

    // Store incoming message in conversation history
    await appendMessage(user.id, 'user', body);

    // Check for pending workflow replies
    const { getPendingReplyForUser, resolvePendingReply } = require('../db/queries');
    const pendingReply = await getPendingReplyForUser(user.id);
    if (pendingReply) {
      await resolvePendingReply(pendingReply.id, body);
      const { resumeWorkflowRun } = require('../services/workflow-agent');
      resumeWorkflowRun(pendingReply.run_id, body).catch(err => {
        console.error('[stub-sms] Workflow resume error:', err.message);
      });
      const replyText = 'Got it! Processing your reply...';
      await provider.sendMessage(from, replyText);
      await appendMessage(user.id, 'assistant', replyText);
      return res.json({ success: true, response: replyText });
    }

    // New user discovery path
    if (isNewUser || !user.preferences?.onboarded) {
      const discoveryMsg =
        'Hey! I\'m Wingman — your personal AI.\n' +
        'Get set up in 30 seconds:\n' +
        'https://wingman.app/start\n\n' +
        '(or just keep texting me here!)';
      await provider.sendMessage(from, discoveryMsg);
      await appendMessage(user.id, 'assistant', discoveryMsg);
      const { updateUserPreferences } = require('../db/queries');
      await updateUserPreferences(user.id, { onboarded: false, discoverySmsSent: true });
      return res.json({ success: true, response: discoveryMsg });
    }

    // Process through orchestrator
    let responseText;
    try {
      const orchestrator = require('../services/orchestrator');
      responseText = await orchestrator.processMessage(user, body);
    } catch (err) {
      console.error('[stub-sms] Orchestrator error:', err);
      responseText = 'Sorry, I hit a snag processing your message. Please try again in a moment.';
    }

    await appendMessage(user.id, 'assistant', responseText);
    await provider.sendMessage(from, responseText);

    res.json({ success: true, response: responseText });
  } catch (err) {
    console.error('[stub-sms] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /stub/messages/:phone — get conversation history from Redis
router.get('/messages/:phone', async (req, res) => {
  try {
    let phone = req.params.phone;
    // URL-decode in case + was passed as %2B
    phone = decodeURIComponent(phone);

    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    const key = `stub:messages:${phone}`;
    const messages = await redis.lrange(key, 0, -1);
    res.json({ messages: messages.map((m) => JSON.parse(m)) });
  } catch (err) {
    console.error('[stub-sms] Get messages error:', err);
    res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
});

module.exports = router;

const crypto = require('crypto');
const express = require('express');

const router = express.Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

/**
 * Validate inbound Zapier webhook authenticity via HMAC signature.
 * Zapier sends a X-Zapier-Signature header with HMAC-SHA256 of the body.
 */
function validateSignature(req) {
  const signature = req.headers['x-zapier-signature'] || req.headers['x-hook-secret'];
  if (!signature || !WEBHOOK_SECRET) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/**
 * Route an inbound trigger to the appropriate handler.
 */
async function routeTrigger(triggerType, payload) {
  switch (triggerType) {
    case 'calendar_event_starting':
      // Queue an alert to notify user of upcoming event
      return { handler: 'calendar_alert', queued: true };

    case 'new_transaction':
      // Queue a spending alert if amount exceeds threshold
      return { handler: 'transaction_alert', queued: true };

    case 'task_due':
      // Queue a reminder for due/overdue task
      return { handler: 'task_reminder', queued: true };

    case 'subscription_renewal':
      // Queue a heads-up about upcoming charge
      return { handler: 'subscription_alert', queued: true };

    default:
      console.warn(`Unknown trigger type: ${triggerType}`);
      return { handler: 'unknown', queued: false };
  }
}

/**
 * POST /hooks/zapier
 * Receives inbound Zapier trigger webhooks for proactive notifications.
 * Validates authenticity, routes to the appropriate handler, and queues for async processing.
 */
router.post('/zapier', async (req, res) => {
  try {
    // Validate request authenticity in production
    if (process.env.NODE_ENV === 'production') {
      if (!validateSignature(req)) {
        console.warn('Invalid Zapier webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { trigger_type, user_id, data } = req.body;

    if (!trigger_type) {
      return res.status(400).json({ error: 'Missing trigger_type' });
    }

    const result = await routeTrigger(trigger_type, { userId: user_id, data });

    // Queue for async processing via BullMQ (imported dynamically to avoid
    // circular deps and to allow the notifications worker to be optional)
    if (result.queued) {
      try {
        const { redis } = require('../services/redis');
        const { Queue } = require('bullmq');
        const alertQueue = new Queue('alerts', { connection: redis });
        await alertQueue.add(result.handler, {
          triggerType: trigger_type,
          userId: user_id,
          data,
          receivedAt: Date.now(),
        });
      } catch (queueErr) {
        // Log but don't fail the webhook — we acknowledged receipt
        console.error('Failed to queue alert:', queueErr.message);
      }
    }

    res.json({ received: true, handler: result.handler });
  } catch (err) {
    console.error('Zapier webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;

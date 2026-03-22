const { Worker } = require('bullmq');
const { createRedisClient } = require('../services/redis');
const { getUserById } = require('../db/queries');
const { executeToolCall } = require('../services/zapier-tools');
const { sendSMS } = require('../services/telnyx');

const connection = createRedisClient();

/**
 * Format an alert message based on type and data.
 * Returns { message, expectsReply } where expectsReply indicates
 * the user should respond YES/NO (routed back through orchestrator).
 */
async function formatAlert(alertType, data, user) {
  switch (alertType) {
    case 'large_transaction': {
      const amount = Number(data.amount).toFixed(2);
      const merchant = data.merchant || 'Unknown';
      return {
        message: `Heads up: $${amount} charge from ${merchant}. Expected? Reply YES/NO`,
        expectsReply: true,
      };
    }

    case 'calendar_invite': {
      const title = data.title || 'New event';
      const time = data.time || 'TBD';
      let msg = `New invite: "${title}" at ${time}.`;

      // Check for conflicts if user has Zapier connected
      if (user.zapier_account_id && data.time) {
        try {
          const eventDate = new Date(data.time);
          const windowStart = new Date(eventDate.getTime() - 30 * 60 * 1000).toISOString();
          const windowEnd = new Date(eventDate.getTime() + 90 * 60 * 1000).toISOString();

          const calResult = await executeToolCall('read_calendar', {
            start_date: windowStart,
            end_date: windowEnd,
          }, user.zapier_account_id);

          if (calResult && calResult.events && calResult.events.length > 0) {
            msg += ` Heads up: conflicts with "${calResult.events[0].title}".`;
          }
        } catch (err) {
          console.error('Alert: calendar conflict check failed:', err.message);
        }
      }

      msg += ' Accept? Reply YES/NO';
      return { message: msg, expectsReply: true };
    }

    case 'subscription_renewal': {
      const service = data.service || 'A service';
      const amount = data.amount ? `$${Number(data.amount).toFixed(2)}` : '';
      return {
        message: `Your ${service} ${amount ? `(${amount}) ` : ''}renews tomorrow. Keep? Reply YES/NO`,
        expectsReply: true,
      };
    }

    case 'task_deadline': {
      const taskTitle = data.taskTitle || 'Untitled task';
      const dueIn = data.dueIn || '?';
      return {
        message: `Reminder: "${taskTitle}" due in ${dueIn} hours.`,
        expectsReply: false,
      };
    }

    case 'build_failure': {
      const repo = data.repo || 'unknown';
      const branch = data.branch || 'unknown';
      const error = data.error || 'Unknown error';
      // Truncate error to fit SMS
      const truncatedError = error.length > 120 ? error.substring(0, 117) + '...' : error;
      return {
        message: `Build failed on ${repo}/${branch}: ${truncatedError}`,
        expectsReply: false,
      };
    }

    case 'package_shipped': {
      const carrier = data.carrier || 'Your carrier';
      const tracking = data.tracking || '';
      const arrival = data.estimatedArrival || data.date || 'soon';
      return {
        message: `Your package shipped via ${carrier}! Arriving ${arrival}.${tracking ? ` Tracking: ${tracking}` : ''}`,
        expectsReply: false,
      };
    }

    default:
      return {
        message: `Alert: ${JSON.stringify(data).substring(0, 200)}`,
        expectsReply: false,
      };
  }
}

/**
 * Create and start the event alerts worker.
 */
function startAlertsWorker() {
  const worker = new Worker(
    'event-alerts',
    async (job) => {
      const { userId, alertType, ...alertData } = job.data;
      console.log(`Processing ${alertType} alert for user ${userId}`);

      const user = await getUserById(userId);
      if (!user) {
        console.error(`Alerts worker: user ${userId} not found`);
        return;
      }

      const { message } = await formatAlert(alertType, alertData, user);

      await sendSMS(user.phone, message);
      console.log(`Alert (${alertType}) sent to user ${userId}`);
    },
    {
      connection,
      concurrency: 10,
      limiter: { max: 20, duration: 1000 },
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`Alert job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`Alert job ${job.id} completed`);
  });

  console.log('Event alerts worker started');
  return worker;
}

module.exports = { startAlertsWorker, formatAlert };

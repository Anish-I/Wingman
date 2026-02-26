const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

let morningBriefingQueue;
let eventAlertsQueue;
let automationTriggersQueue;

/**
 * Initialize all BullMQ queues backed by Redis.
 */
function initQueues() {
  morningBriefingQueue = new Queue('morning-briefing', { connection });
  eventAlertsQueue = new Queue('event-alerts', { connection });
  automationTriggersQueue = new Queue('automation-triggers', { connection });

  console.log('BullMQ queues initialized: morning-briefing, event-alerts, automation-triggers');

  return { morningBriefingQueue, eventAlertsQueue, automationTriggersQueue };
}

/**
 * Schedule or update a repeatable morning briefing job for a user.
 * @param {string} userId
 * @param {string} timezone - IANA timezone (e.g. 'America/New_York')
 * @param {string} time - HH:MM in 24h format (e.g. '07:30')
 */
async function scheduleMorningBriefing(userId, timezone, time) {
  if (!morningBriefingQueue) initQueues();

  // Remove existing repeatable job for this user first
  await cancelMorningBriefing(userId);

  const [hour, minute] = time.split(':').map(Number);
  const cron = `${minute} ${hour} * * *`;

  await morningBriefingQueue.add(
    `briefing-${userId}`,
    { userId },
    {
      repeat: {
        pattern: cron,
        tz: timezone,
      },
      jobId: `briefing-${userId}`,
      removeOnComplete: 50,
      removeOnFail: 20,
    }
  );

  console.log(`Scheduled morning briefing for user ${userId} at ${time} ${timezone}`);
}

/**
 * Cancel a user's morning briefing repeatable job.
 * @param {string} userId
 */
async function cancelMorningBriefing(userId) {
  if (!morningBriefingQueue) initQueues();

  const repeatableJobs = await morningBriefingQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id === `briefing-${userId}` || job.name === `briefing-${userId}`) {
      await morningBriefingQueue.removeRepeatableByKey(job.key);
    }
  }
}

/**
 * Queue an event-driven alert for immediate processing.
 * @param {string} userId
 * @param {string} alertType - e.g. 'large_transaction', 'calendar_invite'
 * @param {object} data - alert-specific payload
 */
async function queueAlert(userId, alertType, data) {
  if (!eventAlertsQueue) initQueues();

  await eventAlertsQueue.add(
    alertType,
    { userId, alertType, ...data },
    {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );
}

/**
 * Queue an automation trigger job.
 * @param {string} userId
 * @param {string} automationId
 * @param {object} triggerData
 */
async function queueAutomation(userId, automationId, triggerData) {
  if (!automationTriggersQueue) initQueues();

  await automationTriggersQueue.add(
    `automation-${automationId}`,
    { userId, automationId, ...triggerData },
    {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    }
  );
}

function getQueues() {
  if (!morningBriefingQueue) initQueues();
  return { morningBriefingQueue, eventAlertsQueue, automationTriggersQueue };
}

module.exports = {
  initQueues,
  scheduleMorningBriefing,
  cancelMorningBriefing,
  queueAlert,
  queueAutomation,
  getQueues,
};

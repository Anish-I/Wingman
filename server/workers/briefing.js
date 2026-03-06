const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { getUserById } = require('../db/queries');
const { executeToolCall } = require('../services/zapier-tools');
const { buildMorningBriefing } = require('../services/briefing-builder');
const { sendSMS } = require('../services/telnyx');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Fetch calendar events for today. Returns null on failure.
 */
async function fetchCalendar(zapierAccountId) {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    return await executeToolCall('read_calendar', {
      start_date: startOfDay,
      end_date: endOfDay,
    }, zapierAccountId);
  } catch (err) {
    console.error('Briefing: calendar fetch failed:', err.message);
    return null;
  }
}

/**
 * Fetch overdue tasks. Returns null on failure.
 */
async function fetchOverdueTasks(zapierAccountId) {
  try {
    return await executeToolCall('get_overdue_tasks', {}, zapierAccountId);
  } catch (err) {
    console.error('Briefing: tasks fetch failed:', err.message);
    return null;
  }
}

/**
 * Fetch spending for the past 7 days. Returns null on failure.
 */
async function fetchWeeklySpend(zapierAccountId) {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return await executeToolCall('get_spending_by_category', {
      start_date: weekAgo.toISOString().split('T')[0],
      end_date: now.toISOString().split('T')[0],
    }, zapierAccountId);
  } catch (err) {
    console.error('Briefing: finance fetch failed:', err.message);
    return null;
  }
}

/**
 * Create and start the morning briefing worker.
 */
function startBriefingWorker() {
  const worker = new Worker(
    'morning-briefing',
    async (job) => {
      const { userId } = job.data;
      console.log(`Processing morning briefing for user ${userId}`);

      const user = await getUserById(userId);
      if (!user) {
        console.error(`Briefing worker: user ${userId} not found`);
        return;
      }

      if (!user.zapier_account_id) {
        console.warn(`Briefing worker: user ${userId} has no Zapier account, skipping`);
        return;
      }

      // Fetch all data sources in parallel — each one handles its own errors
      const [calendarData, tasksData, financeData] = await Promise.all([
        fetchCalendar(user.zapier_account_id),
        fetchOverdueTasks(user.zapier_account_id),
        fetchWeeklySpend(user.zapier_account_id),
      ]);

      // Build the briefing even if some data is missing
      const briefingText = await buildMorningBriefing(user, calendarData, tasksData, financeData);

      // Send via SMS
      await sendSMS(user.phone, briefingText);
      console.log(`Morning briefing sent to user ${userId}`);
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`Briefing job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`Briefing job ${job.id} completed`);
  });

  console.log('Morning briefing worker started');
  return worker;
}

module.exports = { startBriefingWorker };

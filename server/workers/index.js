require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Worker } = require('bullmq');
const { redis } = require('../services/redis');
const { runWorkflow } = require('../services/workflows');
const { getPendingReminders, markReminderFired, getUserById } = require('../db/queries');
const { provider } = require('../services/messaging');
const { startBriefingWorker } = require('./briefing');
const { startAlertsWorker } = require('./alerts');

// BullMQ worker: execute scheduled/manual workflow runs
const workflowWorker = new Worker('workflows', async (job) => {
  const { workflowId, userId } = job.data;
  console.log(`[worker] Running workflow ${workflowId} for user ${userId}`);
  return runWorkflow(workflowId, userId);
}, { connection: redis });

workflowWorker.on('failed', (job, err) => {
  console.error(`[worker] Workflow ${job?.data?.workflowId} failed:`, err.message);
});

// Reminder poller: fire due reminders every 60 seconds
async function pollReminders() {
  try {
    const reminders = await getPendingReminders();
    for (const reminder of reminders) {
      const user = await getUserById(reminder.user_id);
      if (user?.phone) {
        await provider.sendMessage(user.phone, `Reminder: ${reminder.message}`);
      }
      await markReminderFired(reminder.id);
      console.log(`[worker] Fired reminder ${reminder.id} for user ${reminder.user_id}`);
    }
  } catch (err) {
    console.error('[worker] Reminder poll error:', err.message);
  }
}

setInterval(pollReminders, 60 * 1000);
pollReminders();

startBriefingWorker();
startAlertsWorker();

console.log('All workers started. Waiting for jobs...');

process.on('SIGTERM', () => {
  console.log('Workers shutting down...');
  process.exit(0);
});

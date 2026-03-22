require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Worker } = require('bullmq');
const { redis } = require('../services/redis');
const { runWorkflow } = require('../services/workflows');
const { getPendingReminders, markReminderFired, getUserById } = require('../db/queries');
const { provider } = require('../services/messaging');
const { startBriefingWorker } = require('./briefing');
const { startAlertsWorker } = require('./alerts');

// BullMQ worker: execute scheduled/manual workflow runs
// Wrapped in try/catch because local Redis 3.x is too old for BullMQ (needs >=5.0).
// In production (docker-compose Redis 7), this runs normally.
// BullMQ requires Redis >=5.0. On older local Redis, log a warning and skip.
const workflowWorker = new Worker('workflows', async (job) => {
  const { workflowId, userId } = job.data;
  console.log(`[worker] Running workflow ${workflowId} for user ${userId}`);

  // Check if this is a v2 agent workflow (has steps) or legacy (has actions)
  const db = require('../db');
  const result = await db.query('SELECT steps, actions FROM workflows WHERE id = $1', [workflowId]);
  const workflow = result.rows[0];

  if (workflow && workflow.steps && workflow.steps.length > 0) {
    // v2: use agent executor
    const { executeWorkflowAgent } = require('../services/workflow-agent');
    return executeWorkflowAgent(workflowId, userId);
  } else {
    // Legacy: use flat action executor
    return runWorkflow(workflowId, userId);
  }
}, { connection: redis });

workflowWorker.on('error', (err) => {
  if (err.message.includes('Redis version')) {
    console.warn('[worker] BullMQ skipped — Redis >=5.0 required (run docker-compose up for Redis 7)');
  } else {
    console.error('[worker] Workflow worker error:', err.message);
  }
});
workflowWorker.on('failed', (job, err) => {
  console.error(`[worker] Workflow ${job?.data?.workflowId} failed:`, err.message);
});

// Reminder poller: fire due reminders every 60 seconds
async function pollReminders() {
  try {
    const reminders = await getPendingReminders();
    for (const reminder of reminders) {
      try {
        const user = await getUserById(reminder.user_id);
        if (!user?.phone) {
          console.warn(`[worker] Reminder ${reminder.id} skipped — user ${reminder.user_id} has no phone`);
          continue;
        }
        await provider.sendMessage(user.phone, `Reminder: ${reminder.message}`);
        await markReminderFired(reminder.id);
        console.log(`[worker] Fired reminder ${reminder.id} for user ${reminder.user_id}`);
      } catch (err) {
        console.error(`[worker] Reminder ${reminder.id} delivery failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[worker] Reminder poll error:', err.message);
  }
}

setInterval(pollReminders, 60 * 1000);
pollReminders();

startBriefingWorker();
startAlertsWorker();

// Seed templates on boot
const { seedTemplates } = require('../services/template-library');
seedTemplates().catch(err => console.error('[worker] Template seed error:', err.message));

console.log('All workers started. Waiting for jobs...');

process.on('SIGTERM', () => {
  console.log('Workers shutting down...');
  process.exit(0);
});

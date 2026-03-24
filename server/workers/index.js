require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const logger = require('../services/logger');
const { getPendingReminders, markReminderFired, getUserById } = require('../db/queries');
const { provider } = require('../services/messaging');
const { startBriefingWorker } = require('./briefing');
const { startAlertsWorker } = require('./alerts');

// Workflow worker is defined in workflow-worker.js — import it instead of
// duplicating a second Worker('workflows') on the same queue.
const { startWorker: startWorkflowWorker } = require('./workflow-worker');
startWorkflowWorker().catch(err => logger.error({ err: err.message }, '[worker] Workflow worker failed to start'));

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
        logger.error({ err: err.message }, `[worker] Reminder ${reminder.id} delivery failed`);
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, '[worker] Reminder poll error');
  }
}

setInterval(pollReminders, 60 * 1000);
pollReminders();

startBriefingWorker();
startAlertsWorker();

// Seed templates on boot
const { seedTemplates } = require('../services/template-library');
seedTemplates().catch(err => logger.error({ err: err.message }, '[worker] Template seed error'));

console.log('All workers started. Waiting for jobs...');

process.on('SIGTERM', () => {
  console.log('Workers shutting down...');
  process.exit(0);
});

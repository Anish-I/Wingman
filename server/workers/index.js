require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { startBriefingWorker } = require('./briefing');
const { startAlertsWorker } = require('./alerts');

startBriefingWorker();
startAlertsWorker();

console.log('All workers started. Waiting for jobs...');

process.on('SIGTERM', () => {
  console.log('Workers shutting down...');
  process.exit(0);
});

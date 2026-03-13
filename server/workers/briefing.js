const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { getUserById } = require('../db/queries');
const { executeTool, getTools } = require('../services/composio');
const { provider } = require('../services/messaging');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

async function fetchCalendarViaComposio(entityId) {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const result = await executeTool(entityId, {
      id: 'briefing-calendar',
      name: 'GOOGLECALENDAR_FIND_EVENT',
      input: { start_date: startOfDay, end_date: endOfDay },
    });
    return result;
  } catch (err) {
    console.error('Briefing: calendar fetch failed:', err.message);
    return null;
  }
}

function composeBriefing(user, calendarData) {
  const name = user.name || 'friend';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  let text = `Morning ${name}! It's ${timeStr}.\n\n`;

  if (calendarData && !calendarData.error) {
    const events = Array.isArray(calendarData) ? calendarData : calendarData.data || [];
    if (events.length > 0) {
      text += `Today:\n`;
      for (const evt of events.slice(0, 5)) {
        const summary = evt.summary || evt.title || 'Event';
        text += `• ${summary}\n`;
      }
    } else {
      text += 'Calendar is clear today.';
    }
  } else {
    text += 'Couldn\'t pull your calendar — connect it in the app if you haven\'t.';
  }

  return text.trim();
}

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

      const entityId = String(userId);
      const calendarData = await fetchCalendarViaComposio(entityId);
      const briefingText = composeBriefing(user, calendarData);

      await provider.sendMessage(user.phone, briefingText);
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

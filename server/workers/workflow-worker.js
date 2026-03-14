'use strict';

const { redis } = require('../services/redis');

let workflowWorker = null;

// BullMQ requires Redis >=5.0 — check version before initializing
async function startWorker() {
  try {
    const info = await redis.info('server');
    const versionLine = info.split('\n').find(l => l.startsWith('redis_version:'));
    const version = versionLine ? versionLine.split(':')[1].trim() : '0';
    const [major] = version.split('.').map(Number);

    if (major < 5) {
      console.warn(`[workflow-worker] BullMQ skipped — Redis ${version} detected, requires >=5.0 (local dev fallback)`);
      return null;
    }

    const { Worker } = require('bullmq');
    workflowWorker = new Worker('workflows', async (job) => {
      const { workflowId, userId } = job.data;
      console.log(`[workflow-worker] Running workflow ${workflowId} for user ${userId}`);

      const db = require('../db');
      const result = await db.query('SELECT steps, actions FROM workflows WHERE id = $1', [workflowId]);
      const workflow = result.rows[0];

      if (workflow && workflow.steps && workflow.steps.length > 0) {
        const { executeWorkflowAgent } = require('../services/workflow-agent');
        return executeWorkflowAgent(workflowId, userId);
      } else {
        const { runWorkflow } = require('../services/workflows');
        return runWorkflow(workflowId, userId);
      }
    }, { connection: redis });

    workflowWorker.on('completed', (job) => {
      console.log(`[workflow-worker] Job ${job.id} completed for workflow ${job.data.workflowId}`);
    });
    workflowWorker.on('failed', (job, err) => {
      console.error(`[workflow-worker] Job ${job?.id} failed:`, err.message);
    });
    workflowWorker.on('error', (err) => {
      console.error('[workflow-worker] Worker error:', err.message);
    });

    console.log(`[workflow-worker] Started (Redis ${version})`);
    return workflowWorker;
  } catch (err) {
    console.warn('[workflow-worker] Could not start:', err.message);
    return null;
  }
}

startWorker();

module.exports = { getWorker: () => workflowWorker };

'use strict';

const { Worker } = require('bullmq');
const { redis } = require('../services/redis');

const workflowWorker = new Worker('workflows', async (job) => {
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
  console.error(`[workflow-worker] Job ${job?.id} failed for workflow ${job?.data?.workflowId}:`, err.message);
});

workflowWorker.on('error', (err) => {
  if (err.message.includes('Redis version')) {
    console.warn('[workflow-worker] BullMQ skipped — Redis >=5.0 required');
  } else {
    console.error('[workflow-worker] Worker error:', err.message);
  }
});

module.exports = workflowWorker;

'use strict';

const logger = require('../services/logger');
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

    const { Worker, UnrecoverableError } = require('bullmq');
    workflowWorker = new Worker('workflows', async (job) => {
      const { workflowId, userId, runId, replyText, resumeAttempt } = job.data || {};

      // Resume a delayed workflow run — no need to re-check active/steps
      if (job.name === 'resume-delayed') {
        if (!runId) throw new UnrecoverableError(`Job ${job.id} missing required field: runId`);
        console.log(`[workflow-worker] Resuming delayed run ${runId} for workflow ${workflowId}`);
        const { resumeWorkflowRun } = require('../services/workflow-agent');
        return resumeWorkflowRun(runId, replyText ?? null, { retryAttempt: resumeAttempt || 0 });
      }

      if (!workflowId || !userId) {
        throw new UnrecoverableError(`Job ${job.id} missing required fields: ${!workflowId ? 'workflowId' : ''} ${!userId ? 'userId' : ''}`.trim());
      }

      console.log(`[workflow-worker] Running workflow ${workflowId} for user ${userId}${runId ? ` (run ${runId})` : ''}`);

      const db = require('../db');
      const result = await db.query('SELECT active, steps, actions FROM workflows WHERE id = $1', [workflowId]);
      const workflow = result.rows[0];

      if (!workflow || workflow.active === false) {
        console.log(`[workflow-worker] Skipping workflow ${workflowId} — inactive or not found`);
        return null;
      }

      if (workflow.steps && workflow.steps.length > 0) {
        const { executeWorkflowAgent } = require('../services/workflow-agent');
        return executeWorkflowAgent(workflowId, userId, { runId });
      } else {
        const { runWorkflow } = require('../services/workflows');
        return runWorkflow(workflowId, userId, { runId });
      }
    }, { connection: redis });

    workflowWorker.on('completed', (job) => {
      console.log(`[workflow-worker] Job ${job.id} completed for workflow ${job.data.workflowId}`);
    });
    workflowWorker.on('failed', (job, err) => {
      logger.error({ err: err.message }, `[workflow-worker] Job ${job?.id} failed`);
    });
    workflowWorker.on('error', (err) => {
      logger.error({ err: err.message }, '[workflow-worker] Worker error');
    });

    console.log(`[workflow-worker] Started (Redis ${version})`);
    return workflowWorker;
  } catch (err) {
    console.warn('[workflow-worker] Could not start:', err.message);
    return null;
  }
}

module.exports = { startWorker, getWorker: () => workflowWorker };

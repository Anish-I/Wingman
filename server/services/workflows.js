'use strict';
const crypto = require('crypto');
const db = require('../db');
const { createWorkflow, listWorkflows, cancelWorkflow, createWorkflowRun, updateWorkflowRun } = require('../db/queries');
const { executeTool } = require('./composio');
const { isValidCron } = require('../lib/validate-cron');

// Queue reference — initialized lazily to avoid circular deps
let workflowQueue = null;
function getQueue() {
  if (!workflowQueue) {
    const { Queue } = require('bullmq');
    const { redis } = require('./redis');
    workflowQueue = new Queue('workflows', { connection: redis });
  }
  return workflowQueue;
}

async function createAndScheduleWorkflow(userId, { name, description, trigger_type, cron_expression, trigger_config, actions }) {
  if (trigger_type === 'schedule' && cron_expression && !isValidCron(cron_expression)) {
    throw new Error(`Invalid cron expression: "${cron_expression}". Expected 5-field format: min hour dom month dow`);
  }

  const workflow = await createWorkflow(userId, { name, description, trigger_type, cron_expression, trigger_config, actions });

  if (trigger_type === 'schedule' && cron_expression) {
    const q = getQueue();
    await q.add('run-workflow', { workflowId: workflow.id, userId }, {
      repeat: { cron: cron_expression },
      jobId: `workflow-${workflow.id}`,
    });
  }
  return workflow;
}

// Lua script: extend lock TTL only if we still own it (value matches)
const EXTEND_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end`;

// Lua script: release lock only if we still own it (value matches)
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

async function runWorkflow(workflowId, userId) {
  const { redis } = require('./redis');
  const lockKey = `workflow:lock:${workflowId}`;
  const lockValue = crypto.randomUUID(); // Ownership token
  const LOCK_TTL = 600; // 10 min — matches max expected workflow duration
  const EXTEND_INTERVAL = Math.floor(LOCK_TTL / 3) * 1000; // TTL/3 — extend well before expiry

  // Acquire: SET NX with our unique value — only succeeds if no lock exists
  const acquired = await redis.set(lockKey, lockValue, 'EX', LOCK_TTL, 'NX');
  if (!acquired) {
    console.log(`[workflows] Skipping workflow ${workflowId} — already running (lock exists)`);
    return [];
  }

  let extendTimer;
  try {
    // Extend the lock periodically — only if we still own it (Lua atomic check)
    // Started inside try so finally always clears it, even on early throw.
    extendTimer = setInterval(async () => {
      try {
        await redis.eval(EXTEND_SCRIPT, 1, lockKey, lockValue, LOCK_TTL);
      } catch (err) { console.error(`[workflows] Lock extend failed for ${lockKey}:`, err.message); }
    }, EXTEND_INTERVAL);
    const result = await db.query('SELECT * FROM workflows WHERE id = $1 AND user_id = $2', [workflowId, userId]);
    const workflow = result.rows[0];
    if (!workflow) throw new Error('Workflow not found');

    const run = await createWorkflowRun(workflowId);
    await updateWorkflowRun(run.id, { status: 'running', started_at: new Date() });

    try {
      const results = [];
      for (const action of (workflow.actions || [])) {
        // action = { name: 'GMAIL_SEND_EMAIL', input: { to, subject, body } }
        const res = await executeTool(String(userId), {
          id: `wf-${run.id}-${action.name}`,
          name: action.name,
          input: action.input || {},
        });
        results.push({ action: action.name, result: res });
      }
      await updateWorkflowRun(run.id, { status: 'completed', completed_at: new Date(), result: { steps: results } });
      return results;
    } catch (err) {
      await updateWorkflowRun(run.id, { status: 'failed', completed_at: new Date(), error: err.message });
      throw err;
    }
  } finally {
    clearInterval(extendTimer);
    // Release: only if we still own it — prevents deleting another runner's lock
    await redis.eval(RELEASE_SCRIPT, 1, lockKey, lockValue).catch(e => console.error(`[workflows] Failed to release lock ${lockKey}:`, e.message));
  }
}

async function stopWorkflow(workflowId, userId) {
  await cancelWorkflow(workflowId, userId);
  // Remove scheduled job
  const q = getQueue();
  const jobs = await q.getRepeatableJobs();
  const job = jobs.find(j => j.id === `workflow-${workflowId}`);
  if (job) await q.removeRepeatableByKey(job.key);
}

module.exports = { createAndScheduleWorkflow, runWorkflow, stopWorkflow, listWorkflows };

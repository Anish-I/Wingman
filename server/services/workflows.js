'use strict';
const db = require('../db');
const { createWorkflow, listWorkflows, cancelWorkflow, createWorkflowRun, updateWorkflowRun } = require('../db/queries');
const { executeTool } = require('./composio');

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

async function runWorkflow(workflowId, userId) {
  const { redis } = require('./redis');
  const lockKey = `workflow:lock:${workflowId}`;

  // Acquire a Redis lock (SET NX EX 300 = 5 min TTL) to prevent concurrent execution
  const acquired = await redis.set(lockKey, Date.now().toString(), 'EX', 300, 'NX');
  if (!acquired) {
    throw new Error('Workflow is already running');
  }

  try {
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
    await redis.del(lockKey).catch(() => {});
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

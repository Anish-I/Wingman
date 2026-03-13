'use strict';
const { callLLM } = require('./llm');
const { executeTool, getTools, selectToolsForMessage } = require('./composio');
const { provider } = require('../services/messaging');
const { getUserById, getWorkflowById, createWorkflowRun, updateWorkflowRun, updateWorkflowRunMessages, getLastWorkflowRunContext, createPendingReply } = require('../db/queries');

const MAX_AGENT_ITERATIONS = 15;

// Pseudo-tool definitions (local tools the agent can call)
const PSEUDO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'NOTIFY_USER',
      description: 'Send an SMS/push notification to the user. Use this to inform the user of results or updates.',
      parameters: { type: 'object', properties: { message: { type: 'string', description: 'The message to send' } }, required: ['message'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'WAIT_FOR_REPLY',
      description: 'Pause the workflow and wait for the user to reply via SMS. Use when you need human confirmation or input. The workflow will resume when the user responds.',
      parameters: { type: 'object', properties: { prompt: { type: 'string', description: 'The question/prompt to send the user' } }, required: ['prompt'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'DELAY',
      description: 'Wait for a specified number of seconds before continuing.',
      parameters: { type: 'object', properties: { seconds: { type: 'number', description: 'Number of seconds to wait (max 300)' } }, required: ['seconds'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'UPDATE_CONTEXT',
      description: 'Save key-value data to the workflow context. This persists between recurring runs.',
      parameters: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'SPAWN_WORKFLOW',
      description: 'Create and start a new workflow from a description.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] },
    },
  },
];

function buildWorkflowSystemPrompt(workflow, priorContext) {
  const contextStr = priorContext && Object.keys(priorContext).length > 0
    ? `\nContext from prior runs:\n${JSON.stringify(priorContext, null, 2)}\n`
    : '';

  return `You are a workflow execution agent for Wingman. You execute the user's workflow step by step.

Workflow: "${workflow.name}"
${workflow.description ? `Description: ${workflow.description}` : ''}
${workflow.steps && workflow.steps.length ? `Steps:\n${JSON.stringify(workflow.steps, null, 2)}` : ''}
${workflow.variables && Object.keys(workflow.variables).length ? `Variables: ${JSON.stringify(workflow.variables)}` : ''}
${contextStr}

You have access to Composio tools (external apps) and pseudo-tools:
- NOTIFY_USER: Send the user an SMS notification
- WAIT_FOR_REPLY: Pause and ask the user a question (they'll reply via SMS)
- DELAY: Wait N seconds
- UPDATE_CONTEXT: Save data for future runs of this workflow
- SPAWN_WORKFLOW: Create a new sub-workflow

Execute the workflow. Call tools as needed. If a tool fails, try an alternative approach.
When you're done, respond with a final summary (no tool calls).`;
}

async function executeWorkflowAgent(workflowId, userId, { triggerData } = {}) {
  const [workflow, user] = await Promise.all([
    getWorkflowById(workflowId),
    getUserById(userId),
  ]);
  if (!workflow) throw new Error('Workflow not found');
  if (!user) throw new Error('User not found');

  const run = await createWorkflowRun(workflowId);
  await updateWorkflowRun(run.id, { status: 'running', started_at: new Date() });

  const priorContext = await getLastWorkflowRunContext(workflowId);
  const systemPrompt = buildWorkflowSystemPrompt(workflow, priorContext);

  // Get available Composio tools
  const entityId = String(userId);
  const allTools = await getTools(entityId);
  // Use workflow description to select relevant tools
  const relevantTools = selectToolsForMessage(allTools, `${workflow.name} ${workflow.description || ''}`);
  const tools = [...PSEUDO_TOOLS, ...relevantTools];

  const messages = [];
  const stepLog = [];
  const runContext = { ...(priorContext || {}) };

  // Initial user message to kick off the agent
  const kickoff = triggerData
    ? `Execute this workflow now. Trigger data: ${JSON.stringify(triggerData)}`
    : 'Execute this workflow now.';
  messages.push({ role: 'user', content: kickoff });

  let iterations = 0;
  let response;

  while (iterations < MAX_AGENT_ITERATIONS) {
    response = await callLLM(systemPrompt, messages, tools, { alreadyOpenAIFormat: true });

    if (!response.toolUseBlocks || response.toolUseBlocks.length === 0) break;

    // Append assistant turn
    const assistantContent = [];
    if (response.text) assistantContent.push({ type: 'text', text: response.text });
    for (const block of response.toolUseBlocks) assistantContent.push(block);
    messages.push({ role: 'assistant', content: assistantContent });

    const toolResults = [];
    for (const block of response.toolUseBlocks) {
      let result;
      const stepEntry = { tool: block.name, input: block.input, iteration: iterations };

      try {
        // Handle pseudo-tools
        if (block.name === 'NOTIFY_USER') {
          await provider.sendMessage(user.phone, block.input.message);
          result = { success: true, message: 'User notified' };
        } else if (block.name === 'WAIT_FOR_REPLY') {
          // Pause workflow — save state and insert pending reply
          await provider.sendMessage(user.phone, block.input.prompt);
          await createPendingReply({
            run_id: run.id,
            workflow_id: workflowId,
            user_id: userId,
            prompt_text: block.input.prompt,
          });
          // Save current state before pausing
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ status: 'waiting_for_reply' }),
          });
          messages.push({ role: 'user', content: toolResults });
          stepLog.push({ ...stepEntry, result: 'waiting_for_reply' });
          await updateWorkflowRunMessages(run.id, {
            messages, step_log: stepLog, context: runContext, status: 'waiting',
          });
          return { status: 'waiting', runId: run.id };
        } else if (block.name === 'DELAY') {
          const secs = Math.min(block.input.seconds || 10, 300);
          await new Promise(resolve => setTimeout(resolve, secs * 1000));
          result = { success: true, delayed: secs };
        } else if (block.name === 'UPDATE_CONTEXT') {
          runContext[block.input.key] = block.input.value;
          result = { success: true, key: block.input.key };
        } else if (block.name === 'SPAWN_WORKFLOW') {
          // Create a new workflow via the planner (lazy require to avoid circular)
          const { planAndCreateWorkflows } = require('./workflow-planner');
          const spawned = await planAndCreateWorkflows(user, block.input.description);
          result = { success: true, spawned: spawned.map(w => w.name) };
        } else {
          // Composio tool
          console.log(`[workflow-agent] Tool: ${block.name}`);
          result = await executeTool(entityId, block);
          if (result && result.successful === false) {
            result = { error: result.error || 'Tool execution failed' };
          }
        }
      } catch (err) {
        console.error(`[workflow-agent] Tool failed [${block.name}]:`, err.message);
        result = { error: err.message };
      }

      stepLog.push({ ...stepEntry, result: result?.error ? { error: result.error } : 'ok' });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });

    // Persist state after each iteration
    await updateWorkflowRunMessages(run.id, {
      messages, step_log: stepLog, context: runContext,
    });

    iterations++;
  }

  const finalText = response?.text || 'Workflow completed.';
  await updateWorkflowRun(run.id, { status: 'completed', completed_at: new Date(), result: { summary: finalText, stepLog } });
  await updateWorkflowRunMessages(run.id, { messages, step_log: stepLog, context: runContext, status: 'completed' });

  return { status: 'completed', runId: run.id, summary: finalText };
}

/**
 * Resume a paused workflow run after the user replies.
 */
async function resumeWorkflowRun(runId, replyText) {
  const run = await require('../db/queries').getWorkflowRun(runId);
  if (!run || run.status !== 'waiting') throw new Error('Run not found or not waiting');

  const workflow = await getWorkflowById(run.workflow_id);
  const user = await getUserById(workflow.user_id);
  if (!workflow || !user) throw new Error('Workflow or user not found');

  await updateWorkflowRun(runId, { status: 'running' });

  const priorContext = run.context || {};
  const systemPrompt = buildWorkflowSystemPrompt(workflow, priorContext);

  const entityId = String(workflow.user_id);
  const allTools = await getTools(entityId);
  const relevantTools = selectToolsForMessage(allTools, `${workflow.name} ${workflow.description || ''}`);
  const tools = [...PSEUDO_TOOLS, ...relevantTools];

  // Restore saved messages and inject the user's reply
  const messages = run.messages || [];
  const stepLog = run.step_log || [];
  const runContext = { ...priorContext };

  // Add the user's reply as a tool result for the last WAIT_FOR_REPLY
  messages.push({ role: 'user', content: `User replied: "${replyText}"` });

  let iterations = 0;
  let response;

  while (iterations < MAX_AGENT_ITERATIONS) {
    response = await callLLM(systemPrompt, messages, tools, { alreadyOpenAIFormat: true });

    if (!response.toolUseBlocks || response.toolUseBlocks.length === 0) break;

    const assistantContent = [];
    if (response.text) assistantContent.push({ type: 'text', text: response.text });
    for (const block of response.toolUseBlocks) assistantContent.push(block);
    messages.push({ role: 'assistant', content: assistantContent });

    const toolResults = [];
    for (const block of response.toolUseBlocks) {
      let result;
      const stepEntry = { tool: block.name, input: block.input, iteration: iterations };

      try {
        if (block.name === 'NOTIFY_USER') {
          await provider.sendMessage(user.phone, block.input.message);
          result = { success: true, message: 'User notified' };
        } else if (block.name === 'WAIT_FOR_REPLY') {
          await provider.sendMessage(user.phone, block.input.prompt);
          await createPendingReply({
            run_id: runId,
            workflow_id: workflow.id,
            user_id: workflow.user_id,
            prompt_text: block.input.prompt,
          });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ status: 'waiting_for_reply' }),
          });
          messages.push({ role: 'user', content: toolResults });
          stepLog.push({ ...stepEntry, result: 'waiting_for_reply' });
          await updateWorkflowRunMessages(runId, {
            messages, step_log: stepLog, context: runContext, status: 'waiting',
          });
          return { status: 'waiting', runId };
        } else if (block.name === 'DELAY') {
          const secs = Math.min(block.input.seconds || 10, 300);
          await new Promise(resolve => setTimeout(resolve, secs * 1000));
          result = { success: true, delayed: secs };
        } else if (block.name === 'UPDATE_CONTEXT') {
          runContext[block.input.key] = block.input.value;
          result = { success: true, key: block.input.key };
        } else if (block.name === 'SPAWN_WORKFLOW') {
          const { planAndCreateWorkflows } = require('./workflow-planner');
          const spawned = await planAndCreateWorkflows(user, block.input.description);
          result = { success: true, spawned: spawned.map(w => w.name) };
        } else {
          result = await executeTool(entityId, block);
          if (result && result.successful === false) {
            result = { error: result.error || 'Tool execution failed' };
          }
        }
      } catch (err) {
        result = { error: err.message };
      }

      stepLog.push({ ...stepEntry, result: result?.error ? { error: result.error } : 'ok' });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });
    await updateWorkflowRunMessages(runId, { messages, step_log: stepLog, context: runContext });
    iterations++;
  }

  const finalText = response?.text || 'Workflow completed.';
  await updateWorkflowRun(runId, { status: 'completed', completed_at: new Date(), result: { summary: finalText, stepLog } });
  await updateWorkflowRunMessages(runId, { messages, step_log: stepLog, context: runContext, status: 'completed' });

  return { status: 'completed', runId, summary: finalText };
}

module.exports = { executeWorkflowAgent, resumeWorkflowRun };

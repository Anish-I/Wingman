const { callLLM } = require('./llm');
const { buildContext } = require('./context');
const { getConversationHistory, appendMessage } = require('./redis');
const { getTools, executeTool, getConnectionLink, appFromToolName, selectToolsForMessage } = require('./composio');
const { extractAndSaveMemory, getMemoryContext } = require('./memory');
const { planAndCreateWorkflows } = require('./workflow-planner');
const { shouldCache, getCachedResponse, setCachedResponse } = require('./llm-cache');

const MAX_TOOL_ITERATIONS = 5;
const PROCESS_MESSAGE_TIMEOUT = parseInt(process.env.PROCESS_MESSAGE_TIMEOUT || '120000', 10);
const ITERATION_TIMEOUT = parseInt(process.env.ITERATION_TIMEOUT || '30000', 10);
const TOOL_EXEC_TIMEOUT = parseInt(process.env.TOOL_EXEC_TIMEOUT || '20000', 10);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const LOCAL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'CREATE_WORKFLOW',
      description: 'Create an automated workflow or recurring task. Use this when the user wants to set up something that runs on a schedule, triggers on events, or involves multi-step automation.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Natural language description of what the workflow should do, including schedule if any' },
        },
        required: ['description'],
      },
    },
  },
];

async function processMessage(user, messageText) {
  const abortController = { aborted: false };
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.aborted = true;
      reject(new Error('Request timed out'));
    }, PROCESS_MESSAGE_TIMEOUT);
  });
  try {
    const result = await Promise.race([_processMessageInner(user, messageText, abortController), timeout]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _processMessageInner(user, messageText, abortController = { aborted: false }) {
  try {
  const userId = String(user.id);

  const [history, allTools] = await Promise.all([
    getConversationHistory(user.id),
    getTools(userId),
  ]);

  const selectedTools = selectToolsForMessage(allTools, messageText);
  const tools = [...LOCAL_TOOLS, ...selectedTools];
  console.log(`[user:${userId}] Tools: ${tools.length}/${allTools.length}`);

  // Check semantic cache before doing any LLM work
  if (shouldCache(messageText)) {
    const cached = await getCachedResponse(messageText, userId);
    if (cached) {
      if (abortController.aborted) return cached;
      await appendMessage(user.id, 'user', messageText);
      await appendMessage(user.id, 'assistant', cached);
      return cached;
    }
  }

  const memoryContext = getMemoryContext(user);
  const { systemPrompt } = buildContext(user, tools, memoryContext);
  const messages = [...history, { role: 'user', content: messageText }];

  let response;
  let iterations = 0;
  let completed = false;

  while (iterations < MAX_TOOL_ITERATIONS) {
    if (abortController.aborted) break;
    response = await callLLM(systemPrompt, messages, tools, { alreadyOpenAIFormat: true });

    if (!response.toolUseBlocks || response.toolUseBlocks.length === 0) {
      completed = true;
      break;
    }

    // Append assistant turn
    const assistantContent = [];
    if (response.text) assistantContent.push({ type: 'text', text: response.text });
    for (const block of response.toolUseBlocks) assistantContent.push(block);
    messages.push({ role: 'assistant', content: assistantContent });

    // Execute each tool call, tracking completion per-tool to handle iteration timeouts gracefully
    const completedToolIds = new Set();
    const toolResults = [];

    const iterationWork = async () => {
    for (const block of response.toolUseBlocks) {
      let result;
      try {
        if (block.name === 'CREATE_WORKFLOW') {
          const workflows = await withTimeout(
            planAndCreateWorkflows(user, block.input.description),
            TOOL_EXEC_TIMEOUT, `CREATE_WORKFLOW`
          );
          result = { success: true, workflows: workflows.map(w => ({ id: w.id, name: w.name })) };
        } else {
          console.log(`[user:${userId}] Tool: ${block.name}`);
          result = await withTimeout(
            executeTool(userId, block),
            TOOL_EXEC_TIMEOUT, `tool:${block.name}`
          );

          // Composio returns { successful, error } — surface errors cleanly
          if (result && result.successful === false) {
            const errMsg = result.error || 'Tool execution failed';

            // Detect not-connected errors — feed back into LLM loop
            // instead of returning early, so original intent is preserved
            if (/not connected|no connected account|connection not found/i.test(errMsg)) {
              const app = appFromToolName(block.name);
              const link = await getConnectionLink(userId, app).catch(() => null);
              const connectMsg = link
                ? `[${app} is not connected. Auth link: ${link}]`
                : `[${app} is not connected. User should connect at composio.dev]`;
              result = { error: connectMsg };
            } else {
              result = { error: errMsg };
            }
          }
        }
      } catch (err) {
        console.error(`[user:${userId}] Tool failed [${block.name}]:`, err.message);

        // Auth errors — feed back into LLM loop so intent is preserved
        if (/not connected|no connected account|unauthorized|401/i.test(err.message)) {
          const app = appFromToolName(block.name);
          const link = await getConnectionLink(userId, app).catch(() => null);
          const connectMsg = link
            ? `[${app} is not connected. Auth link: ${link}]`
            : `[${app} is not connected. User should connect at composio.dev]`;
          result = { error: connectMsg };
        } else {
          result = { error: err.message };
        }
      }

      completedToolIds.add(block.id);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
    };

    try {
      await withTimeout(iterationWork(), ITERATION_TIMEOUT, `iteration ${iterations + 1}`);
    } catch (iterErr) {
      // Iteration timed out — some tools may have completed, others are still in-flight.
      // Generate error results for tools that didn't finish so the LLM gets complete context.
      console.warn(`[user:${userId}] Iteration ${iterations + 1} timed out: ${iterErr.message}`);
      for (const block of response.toolUseBlocks) {
        if (!completedToolIds.has(block.id)) {
          console.warn(`[user:${userId}] Tool ${block.name} (${block.id}) did not complete — returning timeout error to LLM`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Tool execution timed out — result unavailable. Do not retry this tool call; inform the user the operation is still pending.` }),
          });
        }
      }
    }

    messages.push({ role: 'user', content: toolResults });
    iterations++;
  }

  const finalText = response?.text || (completed
    ? 'Done! Let me know if you need anything else.'
    : "Sorry, I couldn't finish processing that. Please try again.");

  if (!completed) {
    console.warn(`[user:${userId}] Hit MAX_TOOL_ITERATIONS (${MAX_TOOL_ITERATIONS}), persisting history anyway`);
  }

  // Check abort immediately before persisting to close the TOCTOU window.
  // If the timeout fired between the loop exit and here, skip persistence.
  if (abortController.aborted) {
    console.warn(`[user:${userId}] Skipping history append: request timed out`);
    return finalText;
  }
  await appendMessage(user.id, 'user', messageText);
  await appendMessage(user.id, 'assistant', finalText);

  // Cache the response if eligible
  if (shouldCache(messageText) && finalText) {
    await setCachedResponse(messageText, finalText, userId);
  }

  // Fire-and-forget: extract memory from conversation (best-effort, must never crash)
  (async () => { try { await extractAndSaveMemory(user, messages); } catch (err) { console.error('[async-task] memory extraction failed:', err); } })();

  return finalText;
  } catch (err) {
    // Friendly message for rate limit errors
    if (err.message && /rate limit|busy|too many/i.test(err.message)) {
      return "One sec — juggling a few things. Try again in a moment.";
    }
    if (err.message && /timed? ?out|abort/i.test(err.message)) {
      return "Sorry, that took too long. Please try again.";
    }
    throw err;
  }
}

module.exports = { processMessage };

const { callLLM } = require('./llm');
const { buildContext } = require('./context');
const { getConversationHistory, appendMessage } = require('./redis');
const { getTools, executeTool, getConnectionLink, appFromToolName, selectToolsForMessage } = require('./composio');
const { extractAndSaveMemory, getMemoryContext } = require('./memory');
const { planAndCreateWorkflows } = require('./workflow-planner');
const { shouldCache, getCachedResponse, setCachedResponse } = require('./llm-cache');

const MAX_TOOL_ITERATIONS = 5;

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
    const cached = await getCachedResponse(messageText);
    if (cached) {
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

  while (iterations < MAX_TOOL_ITERATIONS) {
    response = await callLLM(systemPrompt, messages, tools, { alreadyOpenAIFormat: true });

    if (!response.toolUseBlocks || response.toolUseBlocks.length === 0) break;

    // Append assistant turn
    const assistantContent = [];
    if (response.text) assistantContent.push({ type: 'text', text: response.text });
    for (const block of response.toolUseBlocks) assistantContent.push(block);
    messages.push({ role: 'assistant', content: assistantContent });

    // Execute each tool call
    const toolResults = [];
    for (const block of response.toolUseBlocks) {
      let result;
      try {
        if (block.name === 'CREATE_WORKFLOW') {
          const workflows = await planAndCreateWorkflows(user, block.input.description);
          result = { success: true, workflows: workflows.map(w => ({ id: w.id, name: w.name })) };
        } else {
          console.log(`[user:${userId}] Tool: ${block.name}`);
          result = await executeTool(userId, block);

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

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });
    iterations++;
  }

  const finalText = response?.text || 'Done! Let me know if you need anything else.';
  await appendMessage(user.id, 'user', messageText);
  await appendMessage(user.id, 'assistant', finalText);

  // Cache the response if eligible
  if (shouldCache(messageText) && finalText) {
    await setCachedResponse(messageText, finalText);
  }

  // Fire-and-forget: extract memory from conversation
  extractAndSaveMemory(user, messages).catch(err => console.error('[async-task] Error:', err.message));

  return finalText;
  } catch (err) {
    // Friendly message for rate limit errors
    if (err.message && /rate limit|busy|too many/i.test(err.message)) {
      return "One sec — juggling a few things. Try again in a moment.";
    }
    throw err;
  }
}

module.exports = { processMessage };

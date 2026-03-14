const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: 'https://api.together.xyz/v1',
});

const MODEL_DEFAULT = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const MODEL_COMPLEX = process.env.TOGETHER_MODEL_COMPLEX || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '2048', 10);

/**
 * Convert Anthropic-format tool definitions to OpenAI function-calling format.
 */
function toOpenAITools(anthropicTools) {
  return anthropicTools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

/**
 * Convert Anthropic-format messages (with tool_use / tool_result blocks)
 * to OpenAI-compatible messages array, prepending a system message.
 */
function toOpenAIMessages(messages, systemPrompt) {
  const result = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter((b) => b.type === 'tool_result');
        const textBlocks = msg.content.filter((b) => b.type === 'text');

        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
          });
        }

        if (textBlocks.length > 0) {
          result.push({ role: 'user', content: textBlocks.map((b) => b.text).join('\n') });
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'assistant', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter((b) => b.type === 'text');
        const toolUseBlocks = msg.content.filter((b) => b.type === 'tool_use');

        const assistantMsg = {
          role: 'assistant',
          content: textBlocks.map((b) => b.text).join('') || null,
        };

        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map((b) => ({
            id: b.id,
            type: 'function',
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input),
            },
          }));
        }

        result.push(assistantMsg);
      }
    }
  }

  return result;
}

/**
 * Call the LLM via Together AI with system prompt, conversation messages, and optional tools.
 * Returns { text, toolUseBlocks } in Anthropic-compatible format.
 */
async function callLLM(systemPrompt, messages, tools, options = {}) {
  const { complex = false } = options;
  const model = complex ? MODEL_COMPLEX : MODEL_DEFAULT;

  const params = {
    model,
    max_tokens: MAX_TOKENS,
    messages: toOpenAIMessages(messages, systemPrompt),
  };

  if (tools && tools.length > 0) {
    const openAITools = options.alreadyOpenAIFormat ? tools : toOpenAITools(tools);
    params.tools = openAITools;
    params.tool_choice = 'auto';
  }

  const MAX_RETRIES = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create(params);
      const choice = response.choices[0];
      const message = choice.message;

      const text = message.content || '';
      const toolUseBlocks = [];

      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          toolUseBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }

      return {
        text,
        toolUseBlocks,
        stopReason: choice.finish_reason,
        usage: response.usage,
      };
    } catch (err) {
      lastErr = err;
      if (err.status === 429 && attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(`[llm] Rate limited, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (err.status === 503 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      break;
    }
  }

  if (lastErr?.status === 429) {
    console.error('[llm] Rate limit hit after retries');
    throw new Error('One moment — I\'m processing a lot of requests. Try again in a few seconds.');
  }
  if (lastErr?.status === 503) {
    throw new Error('AI service is temporarily busy. Please try again shortly.');
  }
  console.error('LLM call failed:', lastErr);
  throw new Error('Failed to process your message. Please try again.');
}

module.exports = { callLLM, MODEL_DEFAULT, MODEL_COMPLEX };

'use strict';

const OpenAI = require('openai');
const { queueLLMCall } = require('./llm-queue');

// Build all provider clients (initialize regardless of LLM_PROVIDER)
const providers = [];

// Primary provider from env (default: gemini per task spec)
const PRIMARY = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

// Gemini client
if (process.env.GEMINI_API_KEY) {
  providers.push({
    name: 'gemini',
    client: new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    }),
    model: process.env.TOGETHER_MODEL || 'gemini-2.5-flash',
    modelComplex: process.env.TOGETHER_MODEL_COMPLEX || 'gemini-2.5-flash',
  });
}

// Together AI client
if (process.env.TOGETHER_API_KEY) {
  providers.push({
    name: 'together',
    client: new OpenAI({
      apiKey: process.env.TOGETHER_API_KEY,
      baseURL: 'https://api.together.xyz/v1',
    }),
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    modelComplex: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  });
}

// Groq client
if (process.env.GROQ_API_KEY) {
  providers.push({
    name: 'groq',
    client: new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    }),
    model: 'llama-3.3-70b-versatile',
    modelComplex: 'llama-3.3-70b-versatile',
  });
}

// Sort providers: primary first, rest as fallbacks
providers.sort((a, b) => {
  if (a.name === PRIMARY) return -1;
  if (b.name === PRIMARY) return 1;
  return 0;
});

if (providers.length === 0) {
  console.error('[llm] No provider API keys configured!');
}

const MODEL_DEFAULT = providers[0]?.model || 'gemini-2.5-flash';
const MODEL_COMPLEX = providers[0]?.modelComplex || 'gemini-2.5-flash';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '2048', 10);

console.log(`[llm] Provider chain: ${providers.map(p => p.name).join(' → ')} | Primary model: ${MODEL_DEFAULT}`);

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

function toOpenAIMessages(messages, systemPrompt) {
  const result = [];
  if (systemPrompt) result.push({ role: 'system', content: systemPrompt });

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
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));
        }
        result.push(assistantMsg);
      }
    }
  }
  return result;
}

async function callLLM(systemPrompt, messages, tools, options = {}) {
  const { complex = false } = options;

  const openAIMessages = toOpenAIMessages(messages, systemPrompt);

  let openAITools;
  if (tools && tools.length > 0) {
    openAITools = options.alreadyOpenAIFormat ? tools : toOpenAITools(tools);
  }

  return queueLLMCall(async () => {
    // Try each provider in fallback order
    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      const model = complex ? provider.modelComplex : provider.model;

      const params = {
        model,
        max_tokens: MAX_TOKENS,
        messages: openAIMessages,
      };

      if (openAITools) {
        params.tools = openAITools;
        params.tool_choice = 'auto';
      }

      const MAX_RETRIES = 3;
      let lastErr;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await provider.client.chat.completions.create(params);
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

          if (i > 0) {
            console.log(`[llm] Fell back to ${provider.name} (was: ${providers[0].name})`);
          }

          return { text, toolUseBlocks, stopReason: choice.finish_reason, usage: response.usage };
        } catch (err) {
          lastErr = err;
          if ((err.status === 429 || err.status === 503) && attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.warn(`[llm] ${provider.name} ${err.status} on attempt ${attempt}, retrying in ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          break;
        }
      }

      // If rate limited / unavailable after retries, try next provider
      if (lastErr?.status === 429 || lastErr?.status === 503) {
        console.log(`[llm] Primary (${provider.name}) rate limited, falling back to ${providers[i + 1]?.name || 'none'}`);
        continue;
      }

      // Real error (not rate limit), don't try other providers
      console.error('[llm] Call failed:', lastErr?.message || lastErr);
      throw new Error('Failed to process your message. Please try again.');
    }

    // All providers exhausted
    console.error('[llm] All providers rate limited');
    throw new Error("One moment — I'm a bit busy. Try again in a few seconds.");
  });
}

module.exports = { callLLM, MODEL_DEFAULT, MODEL_COMPLEX };

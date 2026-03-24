'use strict';

const OpenAI = require('openai');
const logger = require('./logger');
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
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    modelComplex: process.env.GEMINI_MODEL_COMPLEX || 'gemini-2.5-flash',
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
    model: process.env.TOGETHER_MODEL || 'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
    modelComplex: process.env.TOGETHER_MODEL_COMPLEX || 'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
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
  logger.error('[llm] No provider API keys configured!');
}

const MODEL_DEFAULT = providers[0]?.model || 'gemini-2.5-flash';
const MODEL_COMPLEX = providers[0]?.modelComplex || 'gemini-2.5-flash';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '2048', 10);
const LLM_CALL_TIMEOUT = parseInt(process.env.LLM_CALL_TIMEOUT || '60000', 10);
// Decreasing timeouts per fallback level so total wait stays reasonable
const FALLBACK_TIMEOUT_MULTIPLIERS = [1, 0.5, 0.33];

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
  const { complex = false, signal } = options;

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
      const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
      let lastErr;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const multiplier = FALLBACK_TIMEOUT_MULTIPLIERS[Math.min(i, FALLBACK_TIMEOUT_MULTIPLIERS.length - 1)];
          const providerTimeout = Math.round(LLM_CALL_TIMEOUT * multiplier);
          const response = await provider.client.chat.completions.create(params, {
            signal: AbortSignal.timeout(providerTimeout),
          });
          const choice = response.choices[0];
          const message = choice.message;
          const text = message.content || '';
          const toolUseBlocks = [];

          if (message.tool_calls) {
            for (const tc of message.tool_calls) {
              let parsedArgs;
              try {
                parsedArgs = JSON.parse(tc.function.arguments);
              } catch (parseErr) {
                const err = new Error(`Malformed JSON in tool_call arguments for ${tc.function.name}: ${parseErr.message}`);
                err.status = 500;
                err.malformedToolArgs = true;
                throw err;
              }
              toolUseBlocks.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: parsedArgs,
              });
            }
          }

          if (i > 0) {
            console.log(`[llm] Fell back to ${provider.name} (was: ${providers[0].name})`);
          }

          return { text, toolUseBlocks, stopReason: choice.finish_reason, usage: response.usage };
        } catch (err) {
          lastErr = err;
          const isRetryable = TRANSIENT_STATUSES.has(err.status) || !err.status || err.malformedToolArgs;
          if (isRetryable && attempt < MAX_RETRIES) {
            const reason = err.malformedToolArgs ? 'malformed tool args' : (err.status || 'connection error');
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.warn(`[llm] ${provider.name} ${reason} on attempt ${attempt}, retrying in ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          break;
        }
      }

      // Malformed tool args after retries: not a provider infrastructure issue, don't fall back
      if (lastErr?.malformedToolArgs) {
        logger.error({ err: lastErr.message }, '[llm] Malformed tool call JSON after retries');
        throw new Error('Failed to process your message. Please try again.');
      }

      // If transient error (including connection errors) after retries, try next provider
      const isTransient = TRANSIENT_STATUSES.has(lastErr?.status) || !lastErr?.status;
      if (isTransient) {
        console.log(`[llm] ${provider.name} failed (${lastErr?.status || 'connection error'}), falling back to ${providers[i + 1]?.name || 'none'}`);
        continue;
      }

      // Non-transient error (e.g. 401, 403), don't try other providers
      logger.error({ err: lastErr?.message || String(lastErr) }, '[llm] Call failed');
      throw new Error('Failed to process your message. Please try again.');
    }

    // All providers exhausted
    logger.error('[llm] All providers failed');
    throw new Error("One moment — I'm a bit busy. Try again in a few seconds.");
  }, { signal });
}

module.exports = { callLLM, MODEL_DEFAULT, MODEL_COMPLEX };

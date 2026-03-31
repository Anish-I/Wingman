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
const LLM_CALL_TIMEOUT = parseInt(process.env.LLM_CALL_TIMEOUT || '30000', 10);
// Decreasing timeouts per fallback level so total wait stays reasonable
const FALLBACK_TIMEOUT_MULTIPLIERS = [1, 0.5, 0.33];

logger.info(`[llm] Provider chain ready (${providers.length} provider(s)) | Primary model: ${MODEL_DEFAULT}`);

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
    // Collect errors from each provider for diagnostics
    const providerErrors = [];

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
          logger.debug(`[llm] provider-${i} attempt ${attempt}/${MAX_RETRIES} timeout=${providerTimeout}ms`);
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
                logger.warn(`[llm] Skipping tool_call ${tc.function.name} (${tc.id}): malformed JSON — ${parseErr.message} | raw: ${tc.function.arguments}`);
                continue;
              }
              toolUseBlocks.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: parsedArgs,
              });
            }
          }

          // If the LLM tried to call tools but all had malformed JSON, surface a clear message
          if (message.tool_calls?.length > 0 && toolUseBlocks.length === 0 && !text) {
            logger.warn(`[llm] All ${message.tool_calls.length} tool_call(s) from provider-${i} had malformed JSON arguments`);
            return { text: "I tried to perform an action but encountered a formatting issue. Let me try again — could you repeat your request?", toolUseBlocks: [], stopReason: 'malformed_tool_args', usage: response.usage };
          }

          if (i > 0) {
            logger.info(`[llm] Fell back to provider-${i} (primary unavailable)`);
          }

          return { text, toolUseBlocks, stopReason: choice.finish_reason, usage: response.usage };
        } catch (err) {
          lastErr = err;
          // Timeout errors: don't retry, fall back to next provider immediately
          const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
          if (isTimeout) {
            logger.warn(`[llm] provider-${i} timed out after ${Math.round(LLM_CALL_TIMEOUT * FALLBACK_TIMEOUT_MULTIPLIERS[Math.min(i, FALLBACK_TIMEOUT_MULTIPLIERS.length - 1)])}ms, skipping retries`);
            break;
          }
          // Auth errors (401/403) and bad input (400/422): don't retry same provider, fall back
          if ([400, 401, 403, 422].includes(err.status)) {
            logger.warn(`[llm] provider-${i} returned ${err.status}, skipping retries`);
            break;
          }
          const isRetryable = TRANSIENT_STATUSES.has(err.status) || !err.status;
          if (isRetryable && attempt < MAX_RETRIES) {
            const reason = err.status || 'connection error';
            const delay = Math.pow(2, attempt - 1) * 1000;
            logger.warn(`[llm] provider-${i} ${reason} on attempt ${attempt}, retrying in ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          break;
        }
      }

      // Classify the error to decide whether to fall back
      const isTimeout = lastErr?.name === 'TimeoutError' || lastErr?.name === 'AbortError';
      const status = lastErr?.status;
      const AUTH_STATUSES = new Set([401, 403]);
      const BAD_INPUT_STATUSES = new Set([400, 422]);

      let errorType;
      if (isTimeout) {
        errorType = 'timeout';
      } else if (AUTH_STATUSES.has(status)) {
        // Wrong API key / forbidden — other providers have different keys
        errorType = 'auth';
      } else if (BAD_INPUT_STATUSES.has(status)) {
        // Bad request payload (e.g. LLM-specific formatting) — other providers may accept it
        errorType = 'bad-input';
      } else if (TRANSIENT_STATUSES.has(status) || !status) {
        errorType = 'transient';
      } else {
        // Truly non-recoverable (e.g. 404 endpoint not found, 409, etc.)
        errorType = 'non-recoverable';
        providerErrors.push({ provider: `provider-${i}`, status: status || null, message: lastErr?.message || String(lastErr), type: errorType });
        logger.error({ err: lastErr?.message || String(lastErr), providerErrors }, '[llm] Call failed (non-recoverable)');
        throw new Error('Failed to process your message. Please try again.');
      }

      providerErrors.push({ provider: `provider-${i}`, status: status || null, message: lastErr?.message || String(lastErr), type: errorType });
      logger.info(`[llm] provider-${i} failed (${errorType}: ${status || 'no status'}), falling back to next provider`);
    }

    // All providers exhausted — retry primary once if failures were transient
    const RETRYABLE_TYPES = new Set(['transient', 'timeout']);
    const allTransient = providerErrors.length > 0 && providerErrors.every(e => RETRYABLE_TYPES.has(e.type));
    if (allTransient && providers.length > 1) {
      const primary = providers[0];
      const model = complex ? primary.modelComplex : primary.model;
      const retryParams = { model, max_tokens: MAX_TOKENS, messages: openAIMessages };
      if (openAITools) { retryParams.tools = openAITools; retryParams.tool_choice = 'auto'; }
      try {
        logger.info('[llm] All providers failed transiently, retrying primary');
        const response = await primary.client.chat.completions.create(retryParams, {
          signal: AbortSignal.timeout(LLM_CALL_TIMEOUT),
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
              logger.warn(`[llm] Skipping tool_call ${tc.function.name} (${tc.id}): malformed JSON — ${parseErr.message} | raw: ${tc.function.arguments}`);
              continue;
            }
            toolUseBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: parsedArgs,
            });
          }
        }

        // If the LLM tried to call tools but all had malformed JSON, surface a clear message
        if (message.tool_calls?.length > 0 && toolUseBlocks.length === 0 && !text) {
          logger.warn(`[llm] All ${message.tool_calls.length} tool_call(s) from primary retry had malformed JSON arguments`);
          return { text: "I tried to perform an action but encountered a formatting issue. Let me try again — could you repeat your request?", toolUseBlocks: [], stopReason: 'malformed_tool_args', usage: response.usage };
        }

        logger.info('[llm] Primary retry succeeded');
        return { text, toolUseBlocks, stopReason: choice.finish_reason, usage: response.usage };
      } catch (retryErr) {
        providerErrors.push({ provider: 'provider-0', status: retryErr?.status || null, message: retryErr?.message || String(retryErr), type: 'primary-retry' });
      }
    }

    // All providers exhausted — log the full error chain for diagnostics
    logger.error({ providerErrors }, `[llm] All ${providerErrors.length} providers failed`);
    throw new Error("One moment — I'm a bit busy. Try again in a few seconds.");
  }, { signal });
}

module.exports = { callLLM, MODEL_DEFAULT, MODEL_COMPLEX, MAX_TOKENS };

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const MODEL_DEFAULT = 'claude-sonnet-4-5-20241022';
const MODEL_COMPLEX = 'claude-opus-4-5-20250115';
const MAX_TOKENS = 1024;

/**
 * Call Claude with a system prompt, conversation messages, and optional tools.
 * Returns { text, toolUseBlocks } where toolUseBlocks is an array of any tool_use content blocks.
 */
async function callClaude(systemPrompt, messages, tools, { complex = false } = {}) {
  const model = complex ? MODEL_COMPLEX : MODEL_DEFAULT;

  const params = {
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  };

  if (tools && tools.length > 0) {
    params.tools = tools;
  }

  try {
    const response = await client.messages.create(params);

    let text = '';
    const toolUseBlocks = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    return {
      text,
      toolUseBlocks,
      stopReason: response.stop_reason,
      usage: response.usage,
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error [${err.status}]:`, err.message);

      if (err.status === 429) {
        throw new Error('AI service is busy. Please try again in a moment.');
      }
      if (err.status === 529) {
        throw new Error('AI service is temporarily overloaded. Please try again shortly.');
      }
    }
    console.error('Claude call failed:', err);
    throw new Error('Failed to process your message. Please try again.');
  }
}

module.exports = { callClaude, MODEL_DEFAULT, MODEL_COMPLEX };

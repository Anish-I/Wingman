'use strict';

/**
 * Sanitize user-supplied message content before passing to the LLM.
 *
 * Defends against prompt injection by neutralizing patterns that could
 * trick the model into treating user text as system instructions, role
 * switches, or fake tool-call responses.
 *
 * Strategy: bracket the user message with a clear delimiter and escape
 * structural markers that LLMs interpret as role/instruction boundaries.
 * This is defense-in-depth — the tool allowlist and arg validation in the
 * orchestrator are the primary controls; this layer reduces the surface
 * for social-engineering the model itself.
 */

// Patterns that mimic system/role directives or tool-call formatting.
// We don't strip them (that would alter the user's intent) — we escape
// them so the LLM sees them as quoted text, not instructions.
const INJECTION_PATTERNS = [
  // Role-switching attempts
  { pattern: /\b(system|assistant|function|tool)\s*:/gi, replace: '[$1]:' },
  // Common prompt override phrases
  { pattern: /\bignore\s+(all\s+)?previous\s+instructions\b/gi, replace: '[ignore previous instructions]' },
  { pattern: /\byou\s+are\s+now\b/gi, replace: '[you are now]' },
  { pattern: /\bforget\s+(all\s+)?(your\s+)?instructions\b/gi, replace: '[forget instructions]' },
  { pattern: /\boverride\s+(system\s+)?prompt\b/gi, replace: '[override prompt]' },
  { pattern: /\bact\s+as\s+(a\s+)?new\b/gi, replace: '[act as new]' },
  { pattern: /\bnew\s+instructions?\b/gi, replace: '[new instruction]' },
  { pattern: /\bdo\s+not\s+follow\s+(your\s+)?(previous\s+)?instructions\b/gi, replace: '[do not follow instructions]' },
  // Fake tool-call / function-call response markers
  { pattern: /\{"?tool_use_id"?\s*:/gi, replace: '{"[tool_use_id]":' },
  { pattern: /\{"?function_call"?\s*:/gi, replace: '{"[function_call]":' },
  { pattern: /\{"?tool_call"?\s*:/gi, replace: '{"[tool_call]":' },
  // XML-style tags that mimic message structure
  { pattern: /<\s*\/?(?:system|assistant|function|tool|message|instructions?|prompt)\s*>/gi, replace: (m) => `[${m}]` },
  // Markdown-style system message blocks
  { pattern: /^#{1,3}\s*system\s*(prompt|message|instructions?)?/gim, replace: '[system heading]' },
];

/**
 * Sanitize a user message for safe inclusion in the LLM conversation.
 * Returns the sanitized string. Does not throw.
 *
 * @param {string} text - Raw user message
 * @returns {string} Sanitized message
 */
function sanitizeUserMessage(text) {
  if (typeof text !== 'string') return '';

  let sanitized = text;

  for (const { pattern, replace } of INJECTION_PATTERNS) {
    // Reset lastIndex for stateful regexes (global flag)
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, replace);
  }

  return sanitized;
}

module.exports = { sanitizeUserMessage };

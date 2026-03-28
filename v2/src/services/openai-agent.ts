import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const decisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reply'),
    reply: z.string().min(1).max(480)
  }),
  z.object({
    kind: z.literal('clarify'),
    question: z.string().min(1).max(480)
  }),
  z.object({
    kind: z.literal('execute'),
    reply: z.string().min(1).max(480),
    appSlug: z.string().min(1),
    toolSlug: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({})
  }),
  z.object({
    kind: z.literal('schedule'),
    reply: z.string().min(1).max(480),
    automation: z.object({
      name: z.string().min(1).max(80),
      cron: z.string().min(1).max(120),
      appSlug: z.string().min(1),
      toolSlug: z.string().min(1),
      input: z.record(z.string(), z.unknown()).default({})
    })
  })
]);

export type AgentDecision = z.infer<typeof decisionSchema>;

/**
 * JSON Schema for OpenAI structured outputs.
 * OpenAI strict mode requires all properties in `required` and `additionalProperties: false`.
 * Optional fields use `anyOf` with null type to satisfy strict mode constraints.
 */
/**
 * Non-strict JSON schema — strict mode can't represent freeform `input` objects.
 * The Zod schema validates after parsing for full type safety.
 */
const DECISION_JSON_SCHEMA = {
  name: 'agent_decision',
  strict: false,
  schema: {
    type: 'object' as const,
    properties: {
      kind: { type: 'string', enum: ['reply', 'clarify', 'execute', 'schedule'] },
      reply: { type: 'string' },
      question: { type: 'string' },
      appSlug: { type: 'string' },
      toolSlug: { type: 'string' },
      input: { type: 'object' },
      automation: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cron: { type: 'string' },
          appSlug: { type: 'string' },
          toolSlug: { type: 'string' },
          input: { type: 'object' }
        },
        required: ['name', 'cron', 'appSlug', 'toolSlug', 'input']
      }
    },
    required: ['kind']
  }
};

export type ConversationTurn = { role: 'user' | 'assistant'; text: string };

type PlanInput = {
  message: string;
  phone: string;
  connectedApps: string[];
  recentHistory?: ConversationTurn[];
};

const SYSTEM_PROMPT = [
  'You are the planner for an SMS automation assistant called Wingman.',
  'Pick exactly one of these decision kinds:',
  '- reply: answer the user directly',
  '- clarify: ask a follow-up when the request is ambiguous',
  '- execute: call a Composio tool (only when the target app and action are unambiguous)',
  '- schedule: create a recurring automation (use standard 5-field cron)',
  'The user\'s connected apps are listed in the input — only choose those apps.',
  'Keep all SMS copy short and direct (max 480 chars).',
  'Use the conversation history to resolve references like "yes", "that one", "do it".'
].join('\n');

export class OpenAIAgentService {
  private readonly client = new OpenAI({
    apiKey: env.OPENAI_API_KEY
  });

  async decideNextStep(input: PlanInput): Promise<AgentDecision> {
    const historyMessages = (input.recentHistory ?? []).map((turn) => ({
      role: turn.role as 'user' | 'assistant',
      content: turn.text
    }));

    const response = await this.client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
      text: {
        format: {
          type: 'json_schema',
          ...DECISION_JSON_SCHEMA
        }
      },
      input: [
        ...historyMessages,
        {
          role: 'user',
          content: JSON.stringify({
            phone: input.phone,
            connectedApps: input.connectedApps,
            message: input.message
          })
        }
      ]
    });

    const text = response.output_text?.trim();
    if (!text) {
      throw new AppError(502, 'OPENAI_EMPTY_RESPONSE', 'Planner returned an empty response.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      logger.error({ responseText: text }, 'Planner returned non-JSON despite structured output');
      throw new AppError(502, 'OPENAI_INVALID_JSON', 'Planner returned invalid JSON.');
    }

    return decisionSchema.parse(parsed);
  }

  async summarizeToolResult(toolSlug: string, result: unknown): Promise<string> {
    const response = await this.client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: 'Summarize the tool result for SMS in under 320 characters. Do not use markdown. Mention failures clearly.',
      input: [
        {
          role: 'user',
          content: JSON.stringify({ toolSlug, result })
        }
      ]
    });

    return response.output_text?.trim() || 'Done.';
  }
}

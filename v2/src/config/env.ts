import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  TELNYX_API_KEY: z.string().min(1),
  TELNYX_PUBLIC_KEY: z.string().min(1),
  TELNYX_FROM_NUMBER: z.string().min(1),
  TELNYX_MESSAGING_PROFILE_ID: z.string().optional(),
  TELNYX_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  COMPOSIO_API_KEY: z.string().min(1),
  COMPOSIO_BASE_URL: z.string().url().default('https://backend.composio.dev')
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;

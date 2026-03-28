import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_FROM_NUMBER: z.string().min(1),
  COMPOSIO_API_KEY: z.string().min(1),
  COMPOSIO_BASE_URL: z.string().url().default('https://backend.composio.dev')
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wm_inbound_message_status') THEN
    CREATE TYPE wm_inbound_message_status AS ENUM ('received', 'queued', 'processing', 'completed', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wm_connection_status') THEN
    CREATE TYPE wm_connection_status AS ENUM ('connected', 'disconnected', 'errored');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wm_automation_status') THEN
    CREATE TYPE wm_automation_status AS ENUM ('active', 'paused', 'errored');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wm_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wm_inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES wm_users(id) ON DELETE CASCADE,
  telnyx_event_id TEXT NOT NULL UNIQUE,
  from_phone VARCHAR(20) NOT NULL,
  body TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  status wm_inbound_message_status NOT NULL DEFAULT 'received',
  agent_decision JSONB,
  reply_text TEXT,
  error_text TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wm_app_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES wm_users(id) ON DELETE CASCADE,
  app_slug TEXT NOT NULL,
  composio_session_id TEXT NOT NULL,
  composio_account_id TEXT,
  status wm_connection_status NOT NULL DEFAULT 'connected',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_slug)
);

CREATE TABLE IF NOT EXISTS wm_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES wm_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  app_slug TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  tool_input_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  status wm_automation_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wm_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES wm_automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  result JSONB,
  error_text TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wm_inbound_messages_user_received_idx
  ON wm_inbound_messages (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS wm_app_connections_user_status_idx
  ON wm_app_connections (user_id, status);

CREATE INDEX IF NOT EXISTS wm_automations_user_status_idx
  ON wm_automations (user_id, status);

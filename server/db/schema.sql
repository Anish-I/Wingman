-- Wingman database schema

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  phone             VARCHAR(20) UNIQUE NOT NULL,
  name              VARCHAR(255),
  pin_hash          VARCHAR(255),
  zapier_account_id VARCHAR(255),
  preferences       JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connected_apps (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_name      VARCHAR(255) NOT NULL,
  app_slug      VARCHAR(255) NOT NULL,
  zapier_zap_id VARCHAR(255),
  status        VARCHAR(50) NOT NULL DEFAULT 'active',
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_slug)
);

CREATE TABLE IF NOT EXISTS conversation_history (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(50) NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description        TEXT NOT NULL,
  trigger_type       VARCHAR(50) NOT NULL,
  cron_expression    VARCHAR(100),
  webhook_source     VARCHAR(255),
  webhook_event      VARCHAR(255),
  action             VARCHAR(255) NOT NULL,
  action_description TEXT,
  zapier_zap_id      VARCHAR(255),
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  fire_at TIMESTAMPTZ NOT NULL,
  fired BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  cron_expression TEXT,
  trigger_config JSONB,
  actions JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push notification token for mobile app
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Workflow Engine v2: persistent agent workflows

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '{}';

ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]';
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS step_log JSONB DEFAULT '[]';
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  variables JSONB DEFAULT '{}',
  system_prompt TEXT,
  author_user_id BIGINT REFERENCES users(id),
  is_system BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_pending_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  reply_text TEXT
);

-- Indexes on user_id foreign keys for faster joins and lookups
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
-- idx_connected_apps_user_id removed: redundant with UNIQUE(user_id, app_slug)
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_id ON conversation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_pending_replies_user_id ON workflow_pending_replies(user_id);

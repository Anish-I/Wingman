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

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  zapier_account_id VARCHAR(255),
  plan_tier VARCHAR(20) DEFAULT 'free',
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  preferences JSONB DEFAULT '{}',
  pin_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE connected_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  app_name VARCHAR(100) NOT NULL,
  app_slug VARCHAR(100) NOT NULL,
  zapier_zap_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  connected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, app_slug)
);

CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  zapier_zap_id VARCHAR(255),
  trigger_type VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE zapier_tokens (
  zapier_account_id VARCHAR(255) PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_connected_apps_user ON connected_apps(user_id);
CREATE INDEX idx_conversation_history_user ON conversation_history(user_id, created_at DESC);

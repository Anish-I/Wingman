-- Identity linking: ensure all identity columns exist for cross-auth-method unification
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id VARCHAR(255);

-- Allow phone to be nullable (social/email-only users may not have a phone)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Partial unique indexes: enforce uniqueness only for non-null values
-- Using CREATE INDEX IF NOT EXISTS for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;

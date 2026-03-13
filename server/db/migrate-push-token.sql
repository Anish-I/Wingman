-- Run this as the postgres superuser:
-- psql -U postgres -d wingman -f server/db/migrate-push-token.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Make email unique index case-insensitive.
-- The old index on users(email) is case-sensitive, so User@Example.com and
-- user@example.com could coexist if any code path skipped toLowerCase().
-- This replaces it with a LOWER(email) expression index.

DROP INDEX IF EXISTS idx_users_email;
CREATE UNIQUE INDEX idx_users_email ON users(LOWER(email)) WHERE email IS NOT NULL;

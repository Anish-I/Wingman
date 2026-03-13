-- Add email and google_id columns for Google OAuth sign-in
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- Allow phone to be nullable (Google sign-in users may not have a phone)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

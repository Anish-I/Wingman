-- Ensure workflows.user_id and reminders.user_id are NOT NULL.
-- The schema file already declares them as NOT NULL, but databases created
-- before that constraint was added may lack it.  This migration makes the
-- live database match the declared schema, preventing orphaned records and
-- ensuring cascade deletes work for GDPR-style user deletion.

-- Clean up any orphaned rows first (user_id IS NULL), then add the constraint.
DELETE FROM reminders  WHERE user_id IS NULL;
DELETE FROM workflows  WHERE user_id IS NULL;

ALTER TABLE reminders  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE workflows  ALTER COLUMN user_id SET NOT NULL;

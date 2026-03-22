-- Fix foreign key type mismatch: users.id is SERIAL (INTEGER) but several
-- tables declared their user_id columns as BIGINT.  This migration aligns
-- them to INTEGER so the FK types match exactly.

-- reminders.user_id  BIGINT → INTEGER
ALTER TABLE reminders ALTER COLUMN user_id TYPE INTEGER;

-- reminders.id  BIGSERIAL → SERIAL (underlying type BIGINT → INTEGER)
ALTER TABLE reminders ALTER COLUMN id TYPE INTEGER;

-- workflows.user_id  BIGINT → INTEGER
ALTER TABLE workflows ALTER COLUMN user_id TYPE INTEGER;

-- workflow_templates.author_user_id  BIGINT → INTEGER
ALTER TABLE workflow_templates ALTER COLUMN author_user_id TYPE INTEGER;

-- workflow_pending_replies.user_id  BIGINT → INTEGER
ALTER TABLE workflow_pending_replies ALTER COLUMN user_id TYPE INTEGER;

-- Migration: Add indexes on user_id foreign keys for better query performance.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
-- idx_connected_apps_user_id removed: redundant with UNIQUE(user_id, app_slug)
DROP INDEX IF EXISTS idx_connected_apps_user_id;
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_id ON conversation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_role ON conversation_history(user_id, role);
DROP INDEX IF EXISTS idx_workflow_runs_workflow_id;
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id_status_completed_at
  ON workflow_runs(workflow_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_pending_replies_user_id ON workflow_pending_replies(user_id);

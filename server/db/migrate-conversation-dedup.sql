-- Add message_id column for idempotent inserts into conversation_history.
-- Prevents duplicate messages from network/client retries.

ALTER TABLE conversation_history
  ADD COLUMN IF NOT EXISTS message_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_history_message_id
  ON conversation_history (message_id)
  WHERE message_id IS NOT NULL;

-- Add uniqueness protection for append-only workflow run event ordering.
-- Run manually with:
-- psql -U postgres -d wingman -f server/db/migrate-workflow-run-events-seq.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_run_events_run_seq
  ON workflow_run_events(run_id, seq);

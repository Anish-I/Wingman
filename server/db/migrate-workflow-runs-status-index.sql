-- Add partial index on workflow_runs.status for claimWorkflowRunForResume queries
-- that filter WHERE status IN ('waiting', 'delayed')
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status) WHERE status IN ('waiting', 'delayed');

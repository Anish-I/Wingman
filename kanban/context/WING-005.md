# WING-005: Implement Workflow Retry Logic

## Problem
BullMQ workflow jobs fail silently on transient errors (API timeouts, rate limits). No retry mechanism is configured.

## Relevant Files
- `server/workers/workflow-worker.js` — BullMQ job processor
- `server/services/workflow-agent.js` — workflow execution logic
- `server/services/llm.js` — LLM calls that can fail transiently

## Acceptance Criteria
- [ ] BullMQ jobs configured with retry options (attempts, exponential backoff)
- [ ] Transient errors (429, 503, network) trigger retries
- [ ] Permanent errors (400, auth) fail immediately without retry
- [ ] Failed jobs are logged with error details
- [ ] Max retry count is configurable via env var

## Related Code Paths
- BullMQ `Queue` and `Worker` configuration in workflow-worker.js
- LLM error handling in `callLLM()` (429/503 already detected)

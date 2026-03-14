# WING-006: Add Rate Limiting to Workflow Runs

## Problem
No per-user rate limit on workflow executions. A single user could overwhelm the system with rapid workflow triggers.

## Relevant Files
- `server/routes/api.js` — API endpoints that trigger workflows
- `server/services/redis.js` — Redis client (available for rate limit counters)
- `server/index.js` — global rate limiter exists but not per-user for workflows

## Acceptance Criteria
- [ ] Per-user rate limit on workflow triggers (e.g. 10/minute, 100/hour)
- [ ] Rate limit uses Redis sliding window or token bucket
- [ ] Clear error response (429) when limit exceeded
- [ ] Configurable limits via env vars
- [ ] Admin/bypass for testing

## Related Code Paths
- Express rate limiting middleware in `server/index.js`
- Redis connection available via `server/services/redis.js`

# WING-002: Add Test Isolation

## Problem
Tests use hardcoded phone numbers (e.g. `+19995550001` in agent1-infra.js). If tests run concurrently or fail mid-run, leftover data causes subsequent test failures.

## Relevant Files
- `tests/agent1-infra.js` — infrastructure tests (hardcoded `+19995550001`)
- `tests/agent2-services.js` — service integration tests
- `tests/agent3-routes.js` — API route tests
- `tests/run-all.js` — test orchestrator

## Acceptance Criteria
- [ ] Each test run generates a unique phone number (e.g. `+1555` + timestamp)
- [ ] `beforeEach`/`afterEach` or equivalent hooks clean up test users from the DB
- [ ] Tests can run in parallel without conflicts
- [ ] No leftover test data after a clean or aborted run

## Related Code Paths
- PostgreSQL `users` table — phone column used as unique identifier
- `server/db/queries.js` — user creation/deletion queries

# WING-004: Set Up Monitoring/Alerting

## Problem
No monitoring or alerting is configured for the production server. Outages and errors go unnoticed.

## Relevant Files
- `server/index.js` — health check endpoint at `/health`
- `server/workers/alerts.js` — existing alert processor (internal alerts, not monitoring)

## Acceptance Criteria
- [ ] External uptime monitoring on `/health` endpoint
- [ ] Error rate alerting (e.g. Sentry, Datadog, or simple webhook)
- [ ] Resource usage alerts (memory, CPU)
- [ ] Notification channel configured (email, Slack, or SMS)

## Related Code Paths
- `server/index.js` `/health` route returns `{status: "ok"}`
- Pino logger already in use — can integrate with log aggregation

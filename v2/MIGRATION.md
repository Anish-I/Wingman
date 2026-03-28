# Migration Notes

## Keep

- existing Telnyx number and webhook configuration
- existing Composio project and connected-account strategy
- phone-number identity as the primary user key
- Postgres as the system of record

## Drop

- the old mobile app as a launch dependency
- custom email/password auth for the SMS product
- Google auth, social auth, password reset, refresh-token complexity
- parallel agent loops and workflow engines
- provider fallbacks spread across multiple LLM vendors
- the giant "all apps" discovery surface in the model path

## Port Carefully

- migrate only user phone numbers into `wm_users`
- migrate only verified app/session mappings into `wm_app_connections`
- do not copy legacy conversation history blindly
- do not copy legacy workflow JSON blobs into `wm_automations` without manual review

## Recommended Cutover

1. Create the `wm_*` tables from `db/schema.sql`.
2. Stand up `v2` on a separate port and tunnel.
3. Point a non-production Telnyx number at `POST /webhooks/telnyx/inbound`.
4. Manually seed a small set of `wm_app_connections` for testing.
5. Validate one reply flow, one execute flow, and one schedule flow.
6. Only then move the primary production number.

## First Features To Add Next

- Composio connection-link creation and callback handling
- admin/debug endpoints for connections and automation inspection
- automation runner worker
- stricter structured output for the planner
- audit/reporting views for message and tool execution history

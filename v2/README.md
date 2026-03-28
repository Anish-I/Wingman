# Wingman V2

This is the clean restart backend for Wingman.

It narrows the product to one job:

- receive inbound SMS from Telnyx
- plan the next step with the OpenAI Responses API
- execute approved app actions through Composio
- persist state in Postgres
- process inbound work asynchronously with `pg-boss`

## Why this exists

The current repo mixes incompatible product definitions and too many surfaces:

- SMS-only in the old root README
- SMS + mobile app in the current implementation
- conflicting provider choices across Twilio, Telnyx, Zapier, Composio, Together, Gemini, Claude, and OpenAI

V2 keeps the architecture intentionally small:

- one ingress: `POST /webhooks/telnyx/inbound`
- one planner: `OpenAI responses.create`
- one execution layer: Composio REST API
- one persistence layer: Postgres
- one background queue: `pg-boss`

## Current scope

Implemented in this scaffold:

- Telnyx webhook verification and inbound event parsing
- async queueing of inbound SMS work
- user + inbound message persistence
- Responses API-based decision planner
- Composio execution adapter
- automation persistence skeleton

Intentionally deferred:

- hosted app connection flow for Composio
- dashboard auth
- advanced automation scheduling
- multi-step tool loops
- mobile app

## Quick start

```bash
cd v2
cp .env.example .env
npm install
```

Create the tables:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Start the service:

```bash
npm run dev
```

## Endpoints

- `GET /health`
- `POST /webhooks/telnyx/inbound`

## Data model

V2 uses dedicated `wm_*` tables so it can coexist with the current codebase during migration.

- `wm_users`
- `wm_inbound_messages`
- `wm_app_connections`
- `wm_automations`
- `wm_automation_runs`

## Notes

- The Telnyx edge uses the current `telnyx-timestamp` and `telnyx-signature-ed25519` headers.
- The planner uses the Responses API directly, not a custom orchestration loop wrapped around chat completions.
- Composio calls use the current `x-api-key` header.

<div align="center">

# 🤖 Wingman

**Your entire digital life, one text away.**

Wingman is an SMS-native personal AI agent. Text it like a friend — it manages your calendar, handles reminders, runs automations, and talks back. No app. No login. Just SMS.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Together AI](https://img.shields.io/badge/LLM-Together%20AI-6366f1?style=flat-square)](https://together.ai)
[![Telnyx](https://img.shields.io/badge/SMS-Telnyx-00C48C?style=flat-square)](https://telnyx.com)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Cache-Redis-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)

</div>

---

## How It Works

```
You (SMS) ──► Telnyx ──► Express Server ──► Together AI (Llama 4)
                                │                    │
                           PostgreSQL            Tool Calls
                             Redis              ──► Zapier
                                               ──► Calendar
                                               ──► Tasks / Finance
```

You text the number. Wingman reads your message, pulls context, calls tools if needed, and texts you back — all in seconds.

---

## Tech Stack

| Layer | Technology |
|---|---|
| SMS | [Telnyx](https://telnyx.com) |
| AI | [Together AI](https://together.ai) — Llama 4 Maverick |
| Integrations | [Zapier](https://zapier.com) (server-side, hidden from users) |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Cache + Memory | Redis |
| Background Jobs | BullMQ |

---

## Features

- 💬 **Natural language SMS** — just text it, no commands to learn
- 🧠 **Conversation memory** — remembers context within a 24hr window
- 🔁 **Agentic tool loop** — calls tools (calendar, tasks, finance) and reasons over results
- ⏰ **Proactive briefings** — morning summaries via scheduled workers
- ⚡ **Automations** — "Every Friday at 5pm, text me my spending summary"
- 🔒 **SMS deduplication** — idempotent webhook handling via Redis

---

## Project Structure

```
Wingman/
├── .env.example              # Environment variable template
├── server/
│   ├── index.js              # Express app entry point
│   ├── db/
│   │   ├── index.js          # PostgreSQL pool
│   │   ├── queries.js        # Reusable query functions
│   │   └── schema.sql        # Database schema
│   ├── routes/
│   │   ├── sms.js            # Telnyx inbound webhook
│   │   ├── auth.js           # PIN-based auth via SMS OTP
│   │   ├── connect.js        # App connection management
│   │   └── zapier-hooks.js   # Inbound Zapier trigger webhooks
│   ├── services/
│   │   ├── llm.js            # Together AI client (OpenAI-compat)
│   │   ├── orchestrator.js   # Agentic message processing loop
│   │   ├── context.js        # System prompt builder
│   │   ├── telnyx.js         # SMS send + webhook validation
│   │   ├── briefing-builder.js # Morning briefing generator
│   │   ├── automation.js     # NL automation parser + creator
│   │   ├── zapier.js         # Zapier API client
│   │   ├── zapier-tools.js   # Tool execution via Zapier
│   │   └── redis.js          # Redis client + helpers
│   ├── tools/
│   │   ├── registry.js       # Tool registry (per connected apps)
│   │   ├── calendar.js       # Calendar tool definitions
│   │   ├── tasks.js          # Task tool definitions
│   │   ├── finance.js        # Finance tool definitions
│   │   ├── sheets.js         # Sheets tool definitions
│   │   └── notifications.js  # Notification tool definitions
│   └── workers/
│       ├── index.js          # Worker entrypoint
│       ├── briefing.js       # Morning briefing scheduler
│       └── alerts.js         # Proactive alert processor
└── docs/
    └── server-rebuild-plan.md
```

---

## Setup

### Prerequisites
- Node.js 22+
- PostgreSQL 15+
- Redis 7+
- [Telnyx account](https://telnyx.com) with a phone number
- [Together AI API key](https://api.together.ai)

### 1. Clone & install

```bash
git clone https://github.com/Anish-I/Wingman.git
cd Wingman/server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your values (see table below)
```

| Variable | Description |
|---|---|
| `TELNYX_API_KEY` | Telnyx API v2 key |
| `TELNYX_PHONE_NUMBER` | Your Telnyx number e.g. `+17623201647` |
| `TELNYX_MESSAGING_PROFILE_ID` | Messaging profile UUID from Telnyx |
| `TELNYX_PUBLIC_KEY` | Webhook signing key (from Telnyx portal) |
| `TOGETHER_API_KEY` | Together AI API key |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379`) |
| `JWT_SECRET` | Random 32-byte hex string |

Generate `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Initialize database

```bash
psql -U postgres -c "CREATE DATABASE wingman;"
psql -U postgres -d wingman -f server/db/schema.sql
```

### 4. Start the server

```bash
# Development
npm run dev

# Production
npm start
```

### 5. Expose locally for Telnyx webhook

```bash
cloudflared tunnel --url http://localhost:3001
```

Set the Telnyx **Inbound Webhook URL** to:
```
https://your-tunnel-url/webhook/sms
```

---

## Environment Variables Reference

See [`.env.example`](.env.example) for the full template.

---

## License

MIT

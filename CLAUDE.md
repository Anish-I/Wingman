# Wingman — AI Personal Assistant

## What is this
SMS/mobile AI assistant. User texts or uses the app → LLM processes → Composio executes actions across 1,008+ apps (Gmail, Slack, GitHub, Spotify, smart home, etc.).

## Stack
- **Server**: Express.js on port 3001 (`server/`)
- **Mobile/Web**: Expo Router (`mobile-v2/`) — serves both native (iOS/Android) and web
- **LLM**: Gemini 2.5 Flash (primary), Together AI + Groq as fallbacks (`server/services/llm.js`)
- **Integrations**: Composio — 1,008 apps with OAuth, tool calling (`server/services/composio.js`)
- **DB**: PostgreSQL (`postgresql://wingman:wingman@localhost:5432/wingman`)
- **Cache**: Redis on `localhost:6379`
- **SMS**: Twilio (stub mode for local dev)
- **Auth**: JWT (HS256, 24hr expiry, `jsonwebtoken` library)

## Quick Start
```bash
# 1. Start PostgreSQL + Redis (Docker or local)
# 2. Server
cd server && cp .env.example .env  # fill in keys
npm install && node index.js       # runs on :3001

# 3. Mobile/Web
cd mobile-v2
pnpm install
npx expo start --port 8081         # web at localhost:8081
```

## Key Directories
```
server/
  routes/auth.js        — OTP login, Google OAuth, JWT, PIN
  routes/api.js         — Chat, workflows, user prefs (requireAuth)
  routes/sms.js         — Twilio/Telnyx webhook handler
  routes/connect.js     — Composio OAuth flows
  services/llm.js       — Multi-provider LLM with fallback chain
  services/composio.js  — Tool fetching, execution, auth links
  services/orchestrator.js — Agentic loop (LLM → tool call → response)
  services/context.js   — System prompt builder
  db/                   — PostgreSQL schema + queries

mobile-v2/
  src/app/login.tsx          — Phone + OTP login
  src/app/onboarding/        — Signup, phone verify, app connect, permissions
  src/app/(app)/             — Protected tabs: chat, apps, workflows, settings
  src/app/(app)/_layout.tsx  — Auth guard (redirects to /login if signed out)
  src/app/connect/           — OAuth callback handling
  src/features/auth/         — Zustand auth store, signIn/signOut
  src/features/chat/         — Chat API + UI
  src/features/apps/         — App connection status API
  src/lib/api/client.tsx     — Axios client with Bearer token + 401 auto-logout
  src/lib/auth/utils.tsx     — Token storage (MMKV, key: 'wingman_jwt')
  src/lib/storage.tsx        — MMKV init (encrypted on native, plain on web)
  src/data/composio-apps.json — All 1,008 Composio apps with logo URLs
  env.ts                     — EXPO_PUBLIC_API_URL (default: localhost:3001)
```

## Environment Variables (server/.env)
```
PORT=3001
DATABASE_URL=postgresql://wingman:wingman@localhost:5432/wingman
REDIS_URL=redis://localhost:6379
JWT_SECRET=<64+ char random string>
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your key>
MESSAGING_PROVIDER=stub          # use 'twilio' for real SMS
COMPOSIO_API_KEY=<your key>
GOOGLE_CLIENT_ID=<for OAuth>
GOOGLE_CLIENT_SECRET=<for OAuth>
BASE_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:8081
```

## Auth Flow
1. User enters phone → `POST /auth/request-otp` → OTP stored in Redis (10min TTL)
2. User enters 6-digit code → `POST /auth/verify-otp` → JWT returned
3. App stores JWT in MMKV (`wingman_jwt`), Axios interceptor adds `Bearer` header
4. `(app)/_layout.tsx` guard: `signOut` → redirect `/login`, `idle` → render nothing, `signIn` → show tabs
5. 401 from server → auto-signOut via Axios response interceptor

For local dev with `MESSAGING_PROVIDER=stub`, the OTP is logged to server console.

## Composio Integration
- Entity ID = `String(user.id)` — ties user to their connected apps
- When LLM returns a tool_call and the app isn't connected, orchestrator generates an OAuth link and sends it via SMS
- All 1,008 app logos served from `https://logos.composio.dev/api/{slug}`
- Tools come in OpenAI format — do NOT pass through `toOpenAITools()`

## OpenClaw (AI Automation)
Local gateway at `ws://127.0.0.1:18789` that connects to Telegram bot `@wingman_ai_dev_bot`.
- Config: `~/.openclaw/openclaw.json`
- Model: Codex GPT-5.4 (OpenAI sub) or Haiku 4.5 (Anthropic API)
- Cron: Every 4 hours, spawns Claude Code to fix issues and push
- Start: `Start-Process -FilePath node.exe -ArgumentList 'openclaw gateway --port 18789' -WindowStyle Hidden`
- Telegram chat ID: `5006911570`, allowlist mode (only owner)

## CCB (Claude Code Bridge)
MCP server at `~/.claude/.mcp.json` for cross-AI delegation:
- `ccb_ask_codex` — send task to Codex (free via OpenAI sub)
- `ccb_ask_gemini` — send task to Gemini
- `ccb_pend_codex` — get Codex response

## Bot Builder
Codex analyzes, Claude Code executes:
```bash
bash scripts/codex-bot-builder.sh "description of what the bot should do"
# Creates bots/<name>/prompt.md, run.sh, codex-trigger.sh
```

## Security Audit
See `SECURITY-AUDIT.md` for full report. Priority fixes:
- **Done**: H1 (OTP rate limiting), H5 (generic error messages)
- **TODO**: C2/H3 (use jsonwebtoken properly), H2 (crypto.randomInt for OTP), H4 (OAuth callback IDOR), C3 (bcrypt for PINs)

## Git
- Remote: `https://github.com/Anish-I/Wingman.git`
- Branch: `main`
- Always push after meaningful changes: `git push origin main`

## Common Commands
```bash
# Type check mobile
cd mobile-v2 && pnpm type-check

# Start server
cd server && node index.js

# Start Expo
cd mobile-v2 && npx expo start --port 8081

# Start OpenClaw
npx openclaw gateway --port 18789

# Check OpenClaw health
curl http://127.0.0.1:18789/health

# Run Codex analysis
codex exec "analyze C:/Users/ivatu/Wingman/server for issues"
```

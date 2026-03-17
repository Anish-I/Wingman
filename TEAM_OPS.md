# Wingman Team Ops

> Maintained by the AI dev brain. Last updated: 2026-03-16.
> This doc is the source of truth for ongoing work, agent workflows, and handoff context for any new team member or dev taking over.

---

## 🏗️ Project Overview

**Wingman** — SMS-first AI assistant. User texts +17623201647 → Telnyx → Express server → Llama-4-Maverick (Together AI) + Composio (1003 apps) → action → SMS reply.

- **Backend:** `C:/Users/ivatu/Wingman/server/` — Express, PostgreSQL, Redis, BullMQ
- **Mobile:** `C:/Users/ivatu/Wingman/mobile/` — Expo SDK 53, TypeScript, dark navy theme
- **Repo:** https://github.com/Anish-I/Wingman (branch: main)
- **Server port:** 3001
- **SMS number:** +17623201647 (Telnyx)

---

## 🤖 Autonomous Agent Workflow

The AI brain (openclaw) runs these loops continuously:

### Loop 1: Security Audit Fixes — ✅ COMPLETE
All items resolved and pushed to main.
- ✅ H1: OTP rate limiting
- ✅ H2: crypto.randomInt OTP generation
- ✅ H5: Error message leak prevention
- ✅ C2/H3: JWT hardened (jsonwebtoken, iss/aud claims, required secret)
- ✅ H4: OAuth callback IDOR (signed state token in connect.js)
- ✅ C3: bcrypt PIN hashing (cost factor 12, per-user salts)

⚠️ **Migration required:** Existing users with PINs must reset — old SHA-256 hashes are bcrypt-incompatible.

### Loop 2: UI QA + Fix Cycle
- Screenshot the running mobile app (Expo web at localhost:8081)
- Spawn browser agent to inspect interactability
- Log discrepancies as issues
- Send fix notes to Claude Code
- Repeat until all screens pass

**Screens to QA:**
- [ ] Login / OTP flow
- [ ] Chat screen (Pip avatar, suggestion cards, message bubbles)
- [ ] Apps screen (OAuth connect, search, categories)
- [ ] Workflows screen (create, toggle, template suggestions)
- [ ] Settings screen (stats row, logout, PIN)

### Loop 3: CI/CD Pipeline
- [ ] GitHub Actions: lint + test on every PR
- [ ] GitHub Actions: EAS Build trigger on main merge (iOS + Android)
- [ ] Health check endpoint `/health` → monitored by cron
- [ ] Staging environment (separate DB + Redis)
- [ ] Deployment script: `pm2 restart wingman-server`

### Loop 4: Dev/Prod Tooling
- [ ] `.env.example` with all required keys documented
- [ ] `docker-compose.yml` for local dev (PostgreSQL + Redis)
- [ ] Seed script: `npm run db:seed` (test user + sample workflows)
- [ ] `npm run db:migrate` wrapper
- [ ] Postman / Bruno collection for all API endpoints
- [ ] Error monitoring: Sentry integration (server + mobile)
- [ ] Log aggregation: Logtail or similar

---

## 📋 Work Queue (Prioritized)

| Priority | Item | Owner | Status |
|----------|------|-------|--------|
| ✅ Done | H4: OAuth IDOR fix | Claude Code | Complete |
| ✅ Done | C3: bcrypt PIN hashing | Claude Code | Complete |
| ✅ Done | UI QA Pass 1 (4 bugs) | Browser Agent | Complete |
| ✅ Done | UI QA Pass 2 (interactability) | Browser Agent | Complete |
| 🟡 Medium | CI/CD GitHub Actions | Claude Code | In progress |
| 🟡 Medium | docker-compose.yml | Claude Code | In progress |
| 🟡 Medium | .env.example | Claude Code | In progress |
| 🟡 Medium | UI copy fix ("automation"→"workflow") | Claude Code | In progress |
| 🟡 Medium | UI QA Pass 3 — Apps OAuth connect | Browser Agent | Queued |
| 🟡 Medium | UI QA Pass 3 — Workflow creation | Browser Agent | Queued |
| 🟢 Low | Sentry integration | Claude Code | Not started |
| 🟢 Low | Bruno API collection | Manual | Not started |
| 🟢 Low | Staging environment | Infra | Not started |

---

## 🔑 Secrets & Services

| Key | Purpose | Where |
|-----|---------|-------|
| TELNYX_API_KEY | SMS | server/.env |
| TOGETHER_API_KEY | LLM | server/.env |
| COMPOSIO_API_KEY | 1003 app integrations | server/.env |
| JWT_SECRET | Auth tokens (64+ chars, required) | server/.env |
| DATABASE_URL | PostgreSQL | server/.env |
| REDIS_URL | Cache + BullMQ | server/.env |

**Never commit `.env` to git.**

---

## 🧪 Running Tests

```bash
cd server
npm test          # 48 tests, all should pass
npm run lint      # ESLint
```

---

## 🚀 Starting the Stack

```bash
# PostgreSQL + Redis must be running first
cd C:/Users/ivatu/Wingman/server
node server.js

# Mobile
cd C:/Users/ivatu/Wingman/mobile
npx expo start --web
```

---

## 📐 Architecture Quick Reference

```
SMS → Telnyx Webhook → POST /api/sms
                           ↓
                     orchestrator.js
                           ↓
              selectToolsForMessage (top 25, keyword score ≥ 2)
                           ↓
              callLLM (Together AI, tool_choice: 'auto')
                           ↓
              executeTool (Composio) ← loop max 5 iterations
                           ↓
              sendMessage (Telnyx / stub)
                           ↓
              extractAndSaveMemory (background)
```

---

## 🤝 Handoff Notes for New Team Members

1. **Read this file first**, then `server/README.md`
2. **Never** pass Composio tools through `toOpenAITools()` — they're already OpenAI format
3. **Always** set `tool_choice: 'auto'` on Together AI calls or tools won't fire
4. **JWT_SECRET** must be set in `.env` — server hard-exits if missing
5. **Migrations** must run as postgres superuser (tables owned by `postgres`)
6. **Redis is v3.x locally** — BullMQ repeat jobs need Redis ≥ 5.0. Reminder poller uses setInterval fallback
7. **Push to main** after every meaningful change — `git push origin main`
8. The AI brain (openclaw) is autonomous — check `TEAM_OPS.md` and git log for what's been done

---

*This file is auto-maintained. Don't edit manually unless correcting factual errors.*

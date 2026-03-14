# Wingman Full Test & Fix Task (with Obsidian logging)

## Obsidian Vault
- Path: C:/Users/ivatu/ObsidianVault/Wingman
- Use this throughout your work. Log findings, test results, fixes, and decisions as markdown notes.
- Create/update these notes as you go:
  - `Testing/e2e-results.md` — live test results
  - `Architecture/server-status.md` — server health, what's fixed
  - `Bugs/fixed.md` — bugs found and resolved
  - `Bugs/known-issues.md` — things still broken / need attention

## Project Context
- Root: C:/Users/ivatu/Wingman
- Server: server/index.js (Express, port 3001)
- Redis: Docker Redis 7 on port 6380 (REDIS_URL=redis://localhost:6380 in .env)
- MESSAGING_PROVIDER=stub in .env (local testing — no real Twilio calls)
- DB: Supabase PostgreSQL (DATABASE_URL in .env)
- LLM: Together AI (TOGETHER_API_KEY in .env)
- Composio: 1000+ app integrations (COMPOSIO_API_KEY in .env)

## Recent fixes (commit a640dca)
- redis.js: maxRetriesPerRequest=null
- workflow-worker.js: version-checks Redis before BullMQ init
- routes/auth.js: maxRetriesPerRequest=null
- .env: REDIS_URL=redis://localhost:6380, MESSAGING_PROVIDER=stub

## Your Job

### Step 0: Obsidian setup
Create C:/Users/ivatu/ObsidianVault/Wingman/Testing/e2e-results.md with a header and timestamp. You'll update it as tests run.

### Step 1: Start the server
- Kill any existing node processes on port 3001
- Start: `Start-Process node -ArgumentList "server/index.js" -WorkingDirectory "C:/Users/ivatu/Wingman" -RedirectStandardOutput "server.log" -RedirectStandardError "server-err.log" -NoNewWindow -PassThru`
- Wait 5s, verify port 3001 is LISTENING
- If it crashes, read server-err.log and server.log, fix the issue, restart
- Log server startup result to Obsidian

### Step 2: Run E2E Tests

For each test: run it, log result (PASS/FAIL + details) to Obsidian e2e-results.md, fix failures immediately before moving on.

**TEST 1 — Health**
GET http://localhost:3001/health
Expected: {"status":"ok"}

**TEST 2 — New user SMS**
POST http://localhost:3001/stub/sms
JSON: {"from":"+15550000099","body":"hello wingman"}
Expected: {"success":true,"response":"Hey! I'm Wingman..."}

**TEST 3 — Auth (OTP flow)**
- POST /auth/request-otp {"phone":"+15550000099"}
- Read OTP from Redis: node -e "const R=require('./node_modules/ioredis'); const r=new R('redis://localhost:6380',{maxRetriesPerRequest:null}); r.get('otp:+15550000099').then(v=>{console.log(v);r.quit()})"
- POST /auth/verify-otp {"phone":"+15550000099","code":"<otp>"} → save JWT token

**TEST 4 — Mark user onboarded**
PATCH /api/user/preferences with Bearer token
JSON: {"onboarded":true}
(So next SMS hits orchestrator, not discovery flow)

**TEST 5 — LLM Chat**
POST /api/chat {"message":"What can you help me with?"} with Bearer token
Expected: {reply: <non-empty LLM response>}
This tests Together AI integration end-to-end.

**TEST 6 — SMS via Orchestrator (returning user)**
POST /stub/sms {"from":"+15550000099","body":"remind me to drink water every hour"}
Expected: LLM-generated response (not the discovery message)

**TEST 7 — Workflow Plan (NL → workflow)**
POST /api/workflows/plan {"description":"Send me a daily weather summary every morning at 9am"} with Bearer token
Expected: {workflows:[{id:..., name:..., trigger_type:"schedule"}]}
Save the workflow ID.

**TEST 8 — Workflow Persisted**
GET /api/workflows with Bearer token
Expected: array contains the workflow just created

**TEST 9 — Workflow Run (manual trigger)**
POST /api/workflows/<id>/run with Bearer token
Expected: returns {status:"triggered", result:{...}}
Note: Composio tool errors are OK — what matters is the run record is created and workflow-agent executes

**TEST 10 — Composio App Status**
GET /api/apps with Bearer token
Expected: returns JSON (any — just test the endpoint works)

**TEST 11 — Stub message history**
GET http://localhost:3001/stub/messages/%2B15550000099
Expected: {messages:[...]} with at least 3 messages

### Step 3: Fix all failures
Fix every failing test. Document each fix in Obsidian under Bugs/fixed.md.

### Step 4: Update Obsidian with final state
Update these notes:
- Testing/e2e-results.md — full pass/fail table
- Architecture/server-status.md — what's working, Redis version, BullMQ status
- Bugs/fixed.md — what was fixed this session
- Bugs/known-issues.md — anything still not working (e.g. Composio apps not connected)

### Step 5: Push to GitHub
git add -A
git commit -m "test: e2e suite passing, Obsidian docs updated"
git push origin main

### Step 6: Print final summary to console
Format:
```
PASSED: [list of tests]
FAILED: [list]
FIXED: [list of bugs fixed]
NEEDS ATTENTION: [list]
OBSIDIAN: notes updated at C:/Users/ivatu/ObsidianVault/Wingman/
```

When completely done, run:
openclaw system event --text "Done: Wingman e2e tests complete with Obsidian docs" --mode now

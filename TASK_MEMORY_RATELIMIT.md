# Task: Fix Rate Limiting + Test Memory System

## Obsidian: C:/Users/ivatu/ObsidianVault/Wingman
Log to: Architecture/memory-system.md, Bugs/fixed.md

## Context
- Server: C:/Users/ivatu/Wingman/server (Express, port 3001)
- LLM: Gemini 2.5 Flash via LLM_PROVIDER=gemini
- Problem 1: Rate limit errors hitting users because extractAndSaveMemory() fires an extra LLM call after EVERY message
- Problem 2: No request queue — concurrent requests all hit LLM simultaneously
- Memory system: server/services/memory.js — extracts facts, stores in user.preferences.memory (Postgres)
- Context: server/services/context.js — builds system prompt with memory injected

## TASK 1: Fix the rate limit problem

### Fix A: Throttle memory extraction
In server/services/memory.js, change extractAndSaveMemory to:
- Only run if the conversation has >= 3 messages (not on every single message)
- Only run if the last extraction was > 5 minutes ago (store timestamp in user preferences as memory_extracted_at)
- Run in background (already fire-and-forget) but add a 2s delay so it doesn't compete with the main response

### Fix B: LLM request queue
Create server/services/llm-queue.js:
- Simple in-memory queue with concurrency limit of 2 (max 2 simultaneous LLM calls)
- If queue is full, wait (don't error) — use a simple Promise queue pattern
- Export a `queueLLMCall(fn)` wrapper
- Wire it into callLLM in llm.js so all LLM calls go through the queue

### Fix C: Better error message
In server/services/orchestrator.js, catch the rate limit error and return:
"One sec — juggling a few things. Try again in a moment." 
(not the scary "API rate limit reached" message)

## TASK 2: Test memory system end-to-end

Start the server if not running. Then run this conversation sequence via /stub/sms POST requests:

Test phone: +15559990001 (fresh number, no history)

Auth flow first:
- POST /auth/request-otp {phone: "+15559990001"}
- Read OTP from Redis key otp:+15559990001
- POST /auth/verify-otp → get token
- PATCH /api/user/preferences {onboarded: true} with token

Then send these messages IN ORDER and wait 3 seconds between each:
1. "hey I'm Marcus, I live in Austin Texas and I work in tech"
2. "my wife Sarah loves coffee and I usually wake up at 6am"  
3. "remind me to call my boss Mike every Monday at 9am"
4. "what do you know about me?"  ← this should use memory to give a personal summary

After message 4, check the DB:
node -e "
require('dotenv').config({path:'C:/Users/ivatu/Wingman/.env'});
const {Pool} = require('pg');
const pool = new Pool({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
pool.query('SELECT preferences FROM users WHERE phone = \$1', ['+15559990001']).then(r => {
  console.log('MEMORY:', JSON.stringify(r.rows[0]?.preferences?.memory, null, 2));
  pool.end();
});
"

Expected: memory object with name: Marcus, location: Austin Texas, job: tech, people: [Sarah, Mike], habits: [wake up 6am]

## TASK 3: Test workflow memory

After memory is established, test:
5. "set up my usual Monday morning routine" 
   → should use memory context to know about the Mike call at 9am
6. GET /api/workflows with token → confirm workflow was created referencing Marcus's context

## TASK 4: Fix anything broken

## TASK 5: Push
git add -A
git commit -m "fix: LLM queue, throttled memory extraction, memory e2e test passing"
git push origin main

## TASK 6: Obsidian
Write Architecture/memory-system.md explaining:
- How memory extraction works
- What gets stored (name, location, job, people, habits, interests)
- How it feeds into the system prompt
- Current limitations
- How to improve it (vector search, longer history, etc)

## Final output
Print:
MEMORY TEST: [what was extracted vs expected]
RATE LIMIT FIX: [what was done]
QUEUE: [implemented yes/no]
TESTS: pass/fail summary

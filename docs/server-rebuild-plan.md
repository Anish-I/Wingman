# Wingman Server Rebuild Plan

## Context

The `wingman/server` codebase has a solid architecture but several critical bugs and messy patterns that make it unreliable and hard to maintain. Rather than patching individual files, this plan does a clean rewrite of the server while keeping the same folder structure. The web/ frontend is left untouched.

Key problems driving the rebuild:
- **Critical bug**: orchestrator calls `executeZapierTool()` but zapier-tools exports `executeToolCall()` — tool execution is completely broken
- **Single-pass orchestrator**: Only one round of tool calls supported; no true agentic loop
- **History loss**: Tool call/result pairs not saved to history — LLM loses context of what it did
- **Workers never run**: BullMQ queues set up but no job processors defined
- **Messy LLM layer**: OpenRouter + OpenAI format conversion adds latency and a bug-prone translation layer
- **No idempotency**: Duplicate SMS webhooks will trigger duplicate AI responses/actions

---

## What Changes (and What Doesn't)

### Folder structure stays the same:
```
server/
  index.js          ← clean up middleware, routes
  db/               ← keep as-is (schema + queries are fine)
  routes/           ← keep sms.js, auth.js, connect.js; add idempotency to sms.js
  services/
    orchestrator.js ← full rewrite: true agentic while-loop
    llm.js          ← rename from claude.js; use direct API (see LLM note below)
    context.js      ← keep as-is
    telnyx.js       ← keep as-is
    zapier.js       ← keep as-is
    zapier-account.js ← keep as-is
    zapier-tools.js ← fix: export consistent function name, clean transform logic
    redis.js        ← keep as-is
  tools/
    registry.js     ← keep as-is
    *.js            ← keep tool definitions as-is
  workers/
    scheduler.js    ← keep queue init
    briefing.js     ← ADD job processor handler
    alerts.js       ← ADD job processor handler
    index.js        ← NEW: worker entry point that starts all processors
```

---

## Implementation Steps

### 1. Fix `zapier-tools.js` — export name alignment
- Rename exported function from `executeToolCall` to `executeZapierTool` (or vice versa — pick one and align orchestrator)
- Clean up: remove the dynamic import hack in orchestrator since it's just avoiding a circular dep that doesn't actually exist

### 2. Rewrite `orchestrator.js` — true agentic loop
Replace the single-pass if/else with a proper while loop:

```
MAX_TOOL_ITERATIONS = 5

async function processMessage(user, messageText):
  history = await loadHistory(user.id)
  connectedApps = await getConnectedApps(user.id)
  systemPrompt = buildContext(user, connectedApps)
  tools = getToolsForUser(connectedApps)

  messages = [...history, { role: 'user', content: messageText }]

  iterations = 0
  while (iterations < MAX_TOOL_ITERATIONS):
    response = await callLLM(systemPrompt, messages, tools)

    if response.toolCalls.length === 0:
      break  // done — got a text reply

    // Append assistant message WITH tool_use blocks to messages
    messages.push({ role: 'assistant', content: [...textBlocks, ...toolUseBlocks] })

    // Execute all tool calls
    toolResults = []
    for each toolCall:
      result = await executeZapierTool(user, toolCall.name, toolCall.input)
      toolResults.push({ type: 'tool_result', tool_use_id: toolCall.id, content: result })

    // Append tool results as user message
    messages.push({ role: 'user', content: toolResults })

    iterations++

  finalText = response.text || "Done!"

  // Save FULL messages (including tool calls/results) to history
  await saveHistory(user.id, messages.concat([{ role: 'assistant', content: finalText }]))

  return finalText
```

Key changes from current code:
- Tool calls AND results stored in history (LLM has context)
- Loop can handle multi-step tool chains (e.g., read calendar then create event)
- Hard cap at 5 iterations to prevent runaway loops

### 3. LLM layer — Together AI (Llama 4 Maverick)

Use OpenAI-compatible client pointed at `https://api.together.xyz/v1`.
- Model: `meta-llama/Llama-4-Maverick-17B-128E-Instruct`
- Keep message format conversion layer (already exists in claude.js, just retarget)
- Env vars to add: `TOGETHER_API_KEY`, `TOGETHER_MODEL`
- Remove: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` vars
- Make `MAX_TOKENS` an env var (default: 2048)
- Keep dual-model pattern (default vs complex) via env vars

### 4. Add idempotency to `routes/sms.js`
```javascript
// At top of webhook handler:
const msgId = req.body.data?.payload?.id  // Telnyx message ID
const dedupKey = `sms:dedup:${msgId}`
const already = await redis.set(dedupKey, '1', 'NX', 'EX', 300)
if (!already) return res.sendStatus(200)  // duplicate webhook, ignore
```

### 5. Wire up workers in `workers/index.js` (new file)
```javascript
// workers/index.js — entry point: node server/workers/index.js
const { Worker } = require('bullmq')
const redis = require('../services/redis')

const briefingWorker = new Worker('morning-briefing', async (job) => {
  const { userId } = job.data
  // call briefing.js handler
}, { connection: redis })

const alertWorker = new Worker('event-alerts', async (job) => {
  // call alerts.js handler
}, { connection: redis })
```

### 6. Remove dead code
- Delete `server/services/twilio.js` (replaced by telnyx.js)
- Remove dynamic import workaround in orchestrator once circular dep is confirmed gone

---

## Files Modified

| File | Action |
|------|--------|
| `server/services/orchestrator.js` | Full rewrite |
| `server/services/claude.js` → `llm.js` | Rename + rewrite for Together AI |
| `server/services/zapier-tools.js` | Fix export name + minor cleanup |
| `server/routes/sms.js` | Add idempotency check |
| `server/workers/briefing.js` | Add job processor |
| `server/workers/alerts.js` | Add job processor |
| `server/workers/index.js` | New file — worker entry point |
| `server/services/twilio.js` | Delete |
| `server/index.js` | Minor cleanup |

---

## Verification

1. Start server: `node server/index.js`
2. Start workers: `node server/workers/index.js`
3. Send test SMS via Telnyx console → verify webhook fires, Redis gets history entry
4. Send a message that triggers a tool call → verify tool executes, result appears in history, response comes back
5. Send a multi-step request ("check calendar and add event") → verify 2 tool calls happen in single turn
6. Send duplicate webhook (same Telnyx message ID) → verify idempotency key blocks second execution
7. Check Redis: `redis-cli get conv:<userId>` → should contain full tool call + result history

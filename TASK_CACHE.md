# Task: Semantic Response Caching + Multi-Provider Fallback

## Obsidian: C:/Users/ivatu/ObsidianVault/Wingman
Log to: Architecture/caching.md, Architecture/llm-providers.md

## Context
- Redis 7 available at redis://localhost:6380
- LLM: Gemini 2.5 Flash (primary), Together AI (fallback key available)
- Goal: cache LLM responses so 1000 users asking similar things = 1 LLM call
- Goal: multi-provider fallback so 429 on Gemini auto-retries on Together AI

## TASK 1: Semantic Response Cache

Create server/services/llm-cache.js:

### How it works:
1. Before calling LLM, generate a cache key from:
   - Normalized message text (lowercase, trimmed, punctuation removed)
   - A "message type" bucket (greeting / question / task / workflow_create)
2. Check Redis for cached response (TTL: 5 minutes for greetings, 30 minutes for factual)
3. If cache hit → return cached response immediately (no LLM call)
4. If cache miss → call LLM, store result in Redis with TTL
5. Never cache responses that are personalized (contain user name, specific times, tool results)

### Cache key strategy:
- Normalize: lowercase, strip punctuation, collapse whitespace
- Bucket detection:
  - "greeting" if message matches /^(hi|hey|hello|yo|sup|what's up|hiya)/i → TTL 300s
  - "capability" if message matches /what can you|how do you|what do you do|help me/i → TTL 1800s  
  - "status" if message matches /how are you|you there|you working/i → TTL 300s
  - Everything else → no cache (personalized/action requests)
- Key format: `llm:cache:<bucket>:<normalized_text_hash>`

### Integration:
Wire into orchestrator.js BEFORE the LLM call:
```js
const { getCachedResponse, setCachedResponse, shouldCache } = require('./llm-cache');
// Before LLM call:
if (shouldCache(messageText)) {
  const cached = await getCachedResponse(messageText);
  if (cached) {
    await appendMessage(user.id, 'assistant', cached);
    return cached;
  }
}
// After LLM call:
if (shouldCache(messageText) && finalText) {
  await setCachedResponse(messageText, finalText);
}
```

### Also: Cache workflow plans
In workflow-planner.js, cache planWorkflows() results:
- Key: `llm:cache:workflow_plan:<hash_of_description>`
- TTL: 3600s (1 hour) — same workflow description should produce same plan
- Skip cache if description contains specific times/names

## TASK 2: Multi-Provider Fallback

Update server/services/llm.js:

Add fallback chain: Gemini → Together AI → error

```js
const providers = [
  { name: 'gemini', client: geminiClient, model: 'gemini-2.5-flash' },
  { name: 'together', client: togetherClient, model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
];

// Try each provider in order, fallback on 429/503
for (const provider of providers) {
  try {
    const result = await callProvider(provider, params);
    if (attempt > 0) console.log(`[llm] Fell back to ${provider.name}`);
    return result;
  } catch (err) {
    if (err.status === 429 || err.status === 503) continue; // try next
    throw err; // real error, don't retry
  }
}
```

Both clients should be initialized regardless of LLM_PROVIDER env var.
Log when fallback happens: [llm] Primary (gemini) rate limited, falling back to together

## TASK 3: Memory extraction throttle (from previous task)

In server/services/memory.js, add throttle:
- Only extract if messages.length >= 3
- Check user.preferences.memory_extracted_at — skip if < 5 minutes ago
- Add 2s delay before extraction so it doesn't compete with main response
- Update memory_extracted_at timestamp after extraction

## TASK 4: LLM Request Queue

Create server/services/llm-queue.js (may already exist from previous run):
- Max 3 concurrent LLM calls
- Queue excess requests (don't drop them, just wait)
- Track queue depth in logs: [llm-queue] depth: 4, processing: 3

Wire into llm.js: wrap the provider call with the queue

## TASK 5: Test everything

Start server if not running.

Run these tests:

**Cache test:**
Send same message 3 times rapidly:
POST /stub/sms {"from":"+15559880001","body":"hey what can you help me with?"}
× 3 with 1s between each

Check Redis for cache key:
node -e "const R=require('./node_modules/ioredis');const r=new R('redis://localhost:6380',{maxRetriesPerRequest:null});r.keys('llm:cache:*').then(k=>{console.log('Cache keys:',k);r.quit()})"

Expect: at least 1 cache key, 2nd and 3rd responses should be faster

**Fallback test:**
Temporarily set an invalid Gemini key, send a message, verify it falls back to Together AI
Then restore the real key

**Memory throttle test:**
Send 1 message → verify extractAndSaveMemory does NOT fire (< 3 messages)
Send 3 messages → verify it fires

**Queue test:**
Fire 5 simultaneous requests, check logs show queue depth > 1

## TASK 6: Benchmark

Before and after cache:
- Send "what can you help me with?" 5 times
- Log response times for each
- Show: avg with cache vs avg without

## TASK 7: Push
git add -A
git commit -m "feat: semantic response cache, multi-provider LLM fallback, memory throttle, request queue"
git push origin main

## TASK 8: Obsidian docs
Architecture/caching.md:
- Cache strategy explanation
- What gets cached vs not
- Redis key format
- TTL strategy
- Expected cache hit rate at scale

Architecture/llm-providers.md:
- Provider chain: Gemini → Together AI
- How to add new providers
- Rate limits per provider
- Cost per 1M tokens per provider

## Final output
CACHE: [hit rate in test, avg response time cached vs uncached]
FALLBACK: [tested yes/no, worked yes/no]
MEMORY THROTTLE: [working yes/no]
QUEUE: [implemented yes/no]
PUSHED: [commit hash]

When done: openclaw system event --text "Done: caching + fallback built" --mode now

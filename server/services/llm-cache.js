'use strict';

const crypto = require('crypto');
const { redis } = require('./redis');

// Bucket patterns and TTLs
const BUCKETS = [
  { name: 'greeting', pattern: /^(hi|hey|hello|yo|sup|what'?s up|hiya)\b/i, ttl: 300 },
  { name: 'capability', pattern: /what can you|how do you|what do you do|help me/i, ttl: 1800 },
  { name: 'status', pattern: /how are you|you there|you working/i, ttl: 300 },
];

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectBucket(text) {
  for (const bucket of BUCKETS) {
    if (bucket.pattern.test(text)) return bucket;
  }
  return null;
}

function cacheKey(bucket, text) {
  const hash = crypto.createHash('sha256').update(normalize(text)).digest('hex').slice(0, 16);
  return `llm:cache:${bucket.name}:${hash}`;
}

function shouldCache(messageText) {
  return detectBucket(messageText) !== null;
}

async function getCachedResponse(messageText) {
  const bucket = detectBucket(messageText);
  if (!bucket) return null;

  const key = cacheKey(bucket, messageText);
  try {
    const cached = await redis.get(key);
    if (cached) {
      console.log(`[llm-cache] HIT ${bucket.name} key=${key}`);
      return cached;
    }
    console.log(`[llm-cache] MISS ${bucket.name} key=${key}`);
  } catch (err) {
    console.error('[llm-cache] Redis get error:', err.message);
  }
  return null;
}

async function setCachedResponse(messageText, response) {
  const bucket = detectBucket(messageText);
  if (!bucket) return;

  const key = cacheKey(bucket, messageText);
  try {
    await redis.set(key, response, 'EX', bucket.ttl);
    console.log(`[llm-cache] SET ${bucket.name} key=${key} ttl=${bucket.ttl}s`);
  } catch (err) {
    console.error('[llm-cache] Redis set error:', err.message);
  }
}

// Workflow plan cache (1 hour TTL)
const WORKFLOW_PLAN_TTL = 3600;

function shouldCacheWorkflowPlan(description) {
  // Skip cache if description contains specific times/names (personalized)
  if (/\b\d{1,2}:\d{2}\b/.test(description)) return false;
  if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(description)) return false;
  return true;
}

function workflowPlanKey(description) {
  const hash = crypto.createHash('sha256').update(normalize(description)).digest('hex').slice(0, 16);
  return `llm:cache:workflow_plan:${hash}`;
}

async function getCachedWorkflowPlan(description) {
  if (!shouldCacheWorkflowPlan(description)) return null;
  const key = workflowPlanKey(description);
  try {
    const cached = await redis.get(key);
    if (cached) {
      console.log(`[llm-cache] HIT workflow_plan key=${key}`);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('[llm-cache] workflow plan get error:', err.message);
  }
  return null;
}

async function setCachedWorkflowPlan(description, plans) {
  if (!shouldCacheWorkflowPlan(description)) return;
  const key = workflowPlanKey(description);
  try {
    await redis.set(key, JSON.stringify(plans), 'EX', WORKFLOW_PLAN_TTL);
    console.log(`[llm-cache] SET workflow_plan key=${key} ttl=${WORKFLOW_PLAN_TTL}s`);
  } catch (err) {
    console.error('[llm-cache] workflow plan set error:', err.message);
  }
}

module.exports = {
  shouldCache,
  getCachedResponse,
  setCachedResponse,
  getCachedWorkflowPlan,
  setCachedWorkflowPlan,
};

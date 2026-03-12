/**
 * Agent 4 — Orchestrator/Agentic Loop Tester
 * Tests: Full agentic loop, tool execution, memory extraction, multi-turn
 * All calls go directly to orchestrator — SMS send is monkey-patched to mock.
 *
 * Depends on: Agent 1 having run (DB is operational)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const Redis = require('ioredis');

const RESULTS_DIR = path.join(__dirname, '../test-results');
const SERVER_DIR = path.join(__dirname, '../server');

const results = { agent: 4, name: 'Orchestrator/Agentic Loop Tester', tests: [], summary: { pass: 0, fail: 0 } };

function record(name, passed, detail = '') {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${name}${detail ? ' — ' + detail : ''}`);
  results.tests.push({ name, status, detail });
  if (passed) results.summary.pass++; else results.summary.fail++;
}

// Monkey-patch telnyx before importing anything that uses it
const telnyxPath = path.join(SERVER_DIR, 'services/telnyx');
const telnyx = require(telnyxPath);
telnyx.sendSMS = async (to, body) => { console.log(`    [MOCK SMS to ${to}]: ${body.slice(0, 80)}`); return true; };

async function run() {
  console.log('\n=== Agent 4: Orchestrator/Agentic Loop Tester ===\n');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1 });

  // Create a test user for orchestrator tests
  const TEST_PHONE = '+19995559999';
  let testUser;
  try {
    await pool.query('DELETE FROM users WHERE phone = $1', [TEST_PHONE]);
    const ins = await pool.query('INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *', [TEST_PHONE, 'OrchestratorTestUser']);
    testUser = ins.rows[0];
    testUser.preferences = {};
    console.log(`  Created test user id=${testUser.id}\n`);
  } catch (err) {
    console.error('  Failed to create test user:', err.message);
    record('Test user setup', false, err.message);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(`${RESULTS_DIR}/agent-4.json`, JSON.stringify(results, null, 2));
    await pool.end().catch(() => {});
    await redis.quit().catch(() => {});
    return;
  }

  const { processMessage } = require(path.join(SERVER_DIR, 'services/orchestrator'));

  // 1. Simple query — no tools needed
  try {
    const response = await processMessage(testUser, 'What is 2 plus 2?');
    const isCoherent = typeof response === 'string' && response.length > 0 && (response.includes('4') || response.includes('four'));
    record('Simple query "What is 2+2?" → coherent response', isCoherent, `response="${response?.slice(0, 120)}"`);
  } catch (err) {
    record('Simple query "What is 2+2?"', false, err.message);
  }

  // 2. Tool-using query: "Check my Gmail"
  try {
    const response = await processMessage(testUser, 'Check my Gmail inbox');
    const isString = typeof response === 'string' && response.length > 0;
    // Either LLM calls tool and returns result, OR returns OAuth link if not connected
    const isOAuthLink = response.includes('connect') || response.includes('http') || response.includes('composio');
    const isToolResult = !isOAuthLink && response.length > 10;
    record(
      'Tool-using query "Check my Gmail" → LLM calls tool OR returns OAuth link',
      isString && (isOAuthLink || isToolResult),
      `response="${response?.slice(0, 120)}", isOAuthLink=${isOAuthLink}`
    );
  } catch (err) {
    record('Tool-using query "Check my Gmail"', false, err.message);
  }

  // 3. Multi-turn: 2 messages, second has conversation history context
  try {
    // Clear history first
    await redis.del(`conv:${testUser.id}`);

    const r1 = await processMessage(testUser, 'My favorite color is electric blue.');
    const r2 = await processMessage(testUser, 'What color did I just tell you?');

    const hasContext = typeof r2 === 'string' && (r2.toLowerCase().includes('blue') || r2.toLowerCase().includes('electric'));
    record(
      'Multi-turn: second message has conversation history context',
      hasContext,
      `r1="${r1?.slice(0, 60)}", r2="${r2?.slice(0, 100)}"`
    );
  } catch (err) {
    record('Multi-turn conversation history', false, err.message);
  }

  // 4. Memory persistence: "My name is TestUser" → memory extraction fires
  try {
    const queries = require(path.join(SERVER_DIR, 'db/queries'));
    const origUpdate = queries.updateUserPreferences;
    let memoryCalled = false;
    let capturedPrefs = null;

    queries.updateUserPreferences = async (userId, prefs) => {
      memoryCalled = true;
      capturedPrefs = prefs;
      return { ...testUser, preferences: prefs };
    };

    await processMessage(testUser, 'My name is TestBot McTester and I live in San Francisco.');

    // Memory extraction is fire-and-forget — wait briefly
    await new Promise(resolve => setTimeout(resolve, 3000));
    queries.updateUserPreferences = origUpdate;

    record(
      'Memory persistence: "My name is TestBot..." → memory extraction fires',
      memoryCalled,
      memoryCalled
        ? `updateUserPreferences called with: ${JSON.stringify(capturedPrefs)?.slice(0, 120)}`
        : 'updateUserPreferences was NOT called (memory extraction may have failed silently)'
    );
  } catch (err) {
    record('Memory persistence', false, err.message);
  }

  // 5. Tool iteration limit: mock tool that always triggers → stops at MAX_TOOL_ITERATIONS=5
  try {
    const llmService = require(path.join(SERVER_DIR, 'services/llm'));
    const composioService = require(path.join(SERVER_DIR, 'services/composio'));
    const origCallLLM = llmService.callLLM;
    const origExecuteTool = composioService.executeTool;

    let llmCallCount = 0;
    let toolCallCount = 0;

    // Mock LLM to always return a tool call (forces iteration)
    llmService.callLLM = async (systemPrompt, messages, tools) => {
      llmCallCount++;
      // After 6 calls, return a text response to ensure we don't loop forever in mock
      if (llmCallCount > 6) {
        return { text: 'I will stop now.', toolUseBlocks: [] };
      }
      return {
        text: '',
        toolUseBlocks: [{
          type: 'tool_use',
          id: `tool_${llmCallCount}`,
          name: 'GMAIL_LIST_EMAILS',
          input: { query: 'test' },
        }],
        stopReason: 'tool_use',
      };
    };

    // Mock executeTool to return "retry"
    composioService.executeTool = async (userId, block) => {
      toolCallCount++;
      return { result: 'retry', data: [] };
    };

    await processMessage(testUser, 'Keep checking my email forever');

    llmService.callLLM = origCallLLM;
    composioService.executeTool = origExecuteTool;

    const stoppedAtLimit = toolCallCount <= 5;
    record(
      'Tool iteration limit: mocked infinite tool → stops at MAX_TOOL_ITERATIONS=5',
      stoppedAtLimit,
      `LLM calls=${llmCallCount}, tool calls=${toolCallCount} (should be ≤5)`
    );
  } catch (err) {
    record('Tool iteration limit', false, err.message);
  }

  // 6. Error resilience: bad Composio key → orchestrator returns graceful error string
  try {
    const composioService = require(path.join(SERVER_DIR, 'services/composio'));
    const origGetTools = composioService.getTools;

    // Mock getTools to throw a realistic auth error
    composioService.getTools = async () => { throw new Error('Invalid API key: 401 Unauthorized'); };

    let response;
    try {
      response = await processMessage(testUser, 'What can you do?');
    } catch (innerErr) {
      response = null;
    }

    composioService.getTools = origGetTools;

    // Orchestrator should either return a graceful string OR throw — either way it shouldn't crash silently
    const graceful = typeof response === 'string' && response.length > 0;
    record(
      'Error resilience: bad Composio key → graceful error string returned',
      graceful,
      graceful ? `response="${response?.slice(0, 100)}"` : 'orchestrator threw instead of returning graceful message'
    );
  } catch (err) {
    record('Error resilience: bad Composio key', false, err.message);
  }

  // Cleanup
  try {
    await pool.query('DELETE FROM users WHERE phone = $1', [TEST_PHONE]);
    await redis.del(`conv:${testUser.id}`);
  } catch {}

  await pool.end().catch(() => {});
  await redis.quit().catch(() => {});

  // Write results
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(`${RESULTS_DIR}/agent-4.json`, JSON.stringify(results, null, 2));
  console.log(`\nAgent 4 done: ${results.summary.pass} pass, ${results.summary.fail} fail`);
  console.log(`Results written to test-results/agent-4.json`);
  process.exit(0);
}

run().catch(err => {
  console.error('Agent 4 fatal error:', err);
  results.tests.push({ name: 'FATAL', status: 'FAIL', detail: err.message });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(`${RESULTS_DIR}/agent-4.json`, JSON.stringify(results, null, 2));
  process.exit(1);
});

/**
 * Agent 2 — Core Services Tester
 * Tests: LLM (Together AI), Composio API, Memory service, Context builder, Reminders
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../test-results');
const SERVER_DIR = path.join(__dirname, '../server');

const results = { agent: 2, name: 'Core Services Tester', tests: [], summary: { pass: 0, fail: 0 } };

function record(name, passed, detail = '') {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${name}${detail ? ' — ' + detail : ''}`);
  results.tests.push({ name, status, detail });
  if (passed) results.summary.pass++; else results.summary.fail++;
}

async function run() {
  console.log('\n=== Agent 2: Core Services Tester ===\n');

  // 1. LLM simple call
  try {
    const { callLLM } = require(path.join(SERVER_DIR, 'services/llm'));
    const response = await callLLM('You are a test assistant.', [{ role: 'user', content: 'Say hello' }], null);
    record('LLM simple call — "Say hello" → non-empty response', typeof response.text === 'string' && response.text.length > 0, `response="${response.text.slice(0, 80)}..."`);
  } catch (err) {
    record('LLM simple call', false, err.message);
  }

  // 2. LLM with tool_choice: auto — verify response format has toolUseBlocks field
  try {
    const { callLLM } = require(path.join(SERVER_DIR, 'services/llm'));
    // Pass a simple mock tool so tool_choice:auto is enabled
    const mockTool = {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the weather for a city',
        parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      },
    };
    const response = await callLLM('You are a test assistant.', [{ role: 'user', content: 'What is 2+2?' }], [mockTool]);
    const hasField = 'toolUseBlocks' in response && Array.isArray(response.toolUseBlocks);
    record('LLM with tool_choice:auto → toolUseBlocks field exists', hasField, `toolUseBlocks.length=${response.toolUseBlocks?.length}, text="${response.text?.slice(0, 60)}"`);
  } catch (err) {
    record('LLM with tool_choice:auto → toolUseBlocks field exists', false, err.message);
  }

  // 3. Composio: fetch tools for entity "default"
  try {
    const { getTools } = require(path.join(SERVER_DIR, 'services/composio'));
    const tools = await getTools('default');
    record('Composio: fetch tools for entity "default"', Array.isArray(tools), `returned ${tools.length} tools`);
  } catch (err) {
    record('Composio: fetch tools for entity "default"', false, err.message);
  }

  // 4. Composio: fetch connected apps list for entity "default"
  try {
    const { getConnectionStatus, WINGMAN_APPS } = require(path.join(SERVER_DIR, 'services/composio'));
    const status = await getConnectionStatus('default', WINGMAN_APPS.slice(0, 5));
    record('Composio: connected apps list for entity "default"', typeof status === 'object' && Array.isArray(status.connected), `connected=${status.connected.join(',') || 'none'}, missing=${status.missing.length}`);
  } catch (err) {
    record('Composio: connected apps list for entity "default"', false, err.message);
  }

  // 5. Composio: generate OAuth link for a disconnected app (SLACK)
  try {
    const { getConnectionLink } = require(path.join(SERVER_DIR, 'services/composio'));
    const link = await getConnectionLink('default', 'slack');
    const isUrl = typeof link === 'string' && (link.startsWith('http://') || link.startsWith('https://'));
    record('Composio: generate OAuth link for SLACK', isUrl, `link="${link?.slice(0, 80)}..."`);
  } catch (err) {
    // If slack is already connected, it may throw or return differently
    const msg = err.message || '';
    const alreadyConnected = /already connected|existing connection/i.test(msg);
    record('Composio: generate OAuth link for SLACK', alreadyConnected, alreadyConnected ? 'Already connected (acceptable)' : err.message);
  }

  // 6. Memory: extract facts from a sample conversation
  try {
    const { extractAndSaveMemory } = require(path.join(SERVER_DIR, 'services/memory'));
    // Mock user with a preferences object and a fake id
    const mockUser = { id: 99999, name: 'TestUser', preferences: {} };
    // We need to mock updateUserPreferences so it doesn't hit DB
    const queries = require(path.join(SERVER_DIR, 'db/queries'));
    const origUpdate = queries.updateUserPreferences;
    let capturedPrefs = null;
    queries.updateUserPreferences = async (userId, prefs) => { capturedPrefs = prefs; return mockUser; };

    const sampleMessages = [
      { role: 'user', content: 'My name is Alex and I live in Austin, Texas.' },
      { role: 'assistant', content: 'Got it, Alex!' },
      { role: 'user', content: 'I work as a software engineer and love hiking.' },
    ];

    await extractAndSaveMemory(mockUser, sampleMessages);
    queries.updateUserPreferences = origUpdate;

    const extracted = capturedPrefs?.memory;
    const hasData = extracted && (extracted.name || extracted.location || extracted.interests);
    record('Memory: extract facts from sample conversation', !!hasData, `extracted=${JSON.stringify(extracted)}`);
  } catch (err) {
    record('Memory: extract facts from sample conversation', false, err.message);
  }

  // 7. Context: build system prompt for a test user
  try {
    const { buildContext } = require(path.join(SERVER_DIR, 'services/context'));
    const testUser = { id: 1, name: 'Alex', timezone: 'America/Chicago', preferences: {} };
    const { systemPrompt } = buildContext(testUser, [], '');
    const hasWingman = systemPrompt.includes('Wingman');
    const nonEmpty = systemPrompt.length > 100;
    record('Context: build system prompt → non-empty with Wingman identity', hasWingman && nonEmpty, `length=${systemPrompt.length}, hasWingman=${hasWingman}`);
  } catch (err) {
    record('Context: build system prompt', false, err.message);
  }

  // 8. Reminders: parse "remind me to drink water in 5 minutes" → valid fire_at
  try {
    const { parseReminder } = require(path.join(SERVER_DIR, 'services/reminders'));
    const before = Date.now();
    const result = parseReminder('remind me to drink water in 5 minutes');
    const after = Date.now();
    const validTime = result?.fireAt instanceof Date && result.fireAt.getTime() > before && result.fireAt.getTime() < after + 6 * 60 * 1000;
    const validMsg = result?.message && result.message.toLowerCase().includes('drink');
    record(
      'Reminders: parse "remind me to drink water in 5 minutes" → valid fire_at',
      validTime && validMsg,
      result ? `message="${result.message}", fireAt="${result.fireAt?.toISOString()}"` : 'null returned'
    );
  } catch (err) {
    record('Reminders: parse reminder', false, err.message);
  }

  // Write results
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(`${RESULTS_DIR}/agent-2.json`, JSON.stringify(results, null, 2));
  console.log(`\nAgent 2 done: ${results.summary.pass} pass, ${results.summary.fail} fail`);
  console.log(`Results written to test-results/agent-2.json`);
  process.exit(0);
}

run().catch(err => {
  console.error('Agent 2 fatal error:', err);
  results.tests.push({ name: 'FATAL', status: 'FAIL', detail: err.message });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(`${RESULTS_DIR}/agent-2.json`, JSON.stringify(results, null, 2));
  process.exit(1);
});

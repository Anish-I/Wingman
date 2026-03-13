/**
 * Agent 5 — Reviewer
 * Reads all agent-N.json files, tallies pass/fail, produces FINAL-REPORT.md
 */
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../test-results');
const REPORT_PATH = path.join(RESULTS_DIR, 'FINAL-REPORT.md');

function loadAgent(n) {
  const filePath = path.join(RESULTS_DIR, `agent-${n}.json`);
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function run() {
  console.log('\n=== Agent 5: Reviewer ===\n');

  const agents = [1, 2, 3, 4, 6].map(n => ({ n, data: loadAgent(n) }));

  let totalPass = 0;
  let totalFail = 0;
  const criticalBlockers = [];
  const warnings = [];

  // --- Build summary table ---
  const tableRows = [];
  for (const { n, data } of agents) {
    if (!data) {
      tableRows.push(`| Agent ${n} | ERROR | N/A | N/A | Results file missing |`);
      criticalBlockers.push(`Agent ${n} results file not found — agent may have crashed`);
      continue;
    }
    const pass = data.summary?.pass ?? 0;
    const fail = data.summary?.fail ?? 0;
    const total = data.tests?.length ?? 0;
    totalPass += pass;
    totalFail += fail;
    tableRows.push(`| Agent ${n} — ${data.name} | ${total} | ${pass} | ${fail} |`);

    // Classify failures
    for (const test of (data.tests || [])) {
      if (test.status === 'FAIL') {
        const detail = test.detail || '';
        const name = test.name || '';

        // Critical: anything that breaks the core SMS → orchestrator → response flow
        const isCritical = (
          name.includes('PostgreSQL') ||
          name.includes('Redis connection') ||
          name.includes('LLM simple call') ||
          name.includes('processMessage') ||
          name.includes('health') ||
          name.includes('FATAL') ||
          name.includes('Simple query') ||
          detail.includes('ECONNREFUSED') ||
          detail.includes('FATAL')
        );

        if (isCritical) {
          criticalBlockers.push(`[Agent ${n}] ${name}: ${detail}`);
        } else {
          warnings.push(`[Agent ${n}] ${name}: ${detail}`);
        }
      }
    }
  }

  // --- Telnyx status detection ---
  let telnyxStatus = 'UNKNOWN';
  let telnyxDetails = '';

  const agent3 = agents.find(a => a.n === 3)?.data;
  if (agent3) {
    const otpTest = agent3.tests?.find(t => t.name?.includes('request-otp') && t.name?.includes('valid'));
    const directOrchestratorTest = agent3.tests?.find(t => t.name?.includes('Telnyx Workaround'));
    if (otpTest?.status === 'PASS') {
      telnyxStatus = 'WORKING';
      telnyxDetails = 'OTP endpoint returned 200 — Telnyx outbound SMS is functional.';
    } else if (otpTest?.status === 'FAIL' && otpTest.detail?.includes('OTP IS stored in Redis')) {
      telnyxStatus = 'BROKEN (outbound SMS fails, but core auth logic works)';
      telnyxDetails = `OTP stored in Redis correctly. Telnyx sendSMS fails (no funds or invalid key).\n  To go live: Top up Telnyx account at telnyx.com and verify TELNYX_API_KEY + TELNYX_PHONE_NUMBER in .env`;
    } else if (otpTest?.status === 'FAIL') {
      telnyxStatus = 'BROKEN';
      telnyxDetails = otpTest?.detail || 'OTP endpoint failed.';
    }
    if (directOrchestratorTest?.status === 'PASS') {
      telnyxDetails += '\n  Orchestrator direct-call works — core SMS processing pipeline is functional without Telnyx.';
    }
  }

  // --- Recommended fixes (prioritized) ---
  const fixes = [];

  // Check for DB down
  const agent1 = agents.find(a => a.n === 1)?.data;
  if (agent1) {
    const healthTest = agent1.tests?.find(t => t.name?.includes('/health'));
    if (healthTest?.status === 'FAIL') fixes.push('🔴 P0: Server is not running — start with `cd server && node index.js`');

    const pgTest = agent1.tests?.find(t => t.name?.includes('PostgreSQL connection'));
    if (pgTest?.status === 'FAIL') fixes.push('🔴 P0: PostgreSQL is down — check DATABASE_URL in .env and ensure postgres is running');

    const redisTest = agent1.tests?.find(t => t.name?.includes('Redis connection'));
    if (redisTest?.status === 'FAIL') fixes.push('🔴 P0: Redis is down — ensure Redis server is running (`redis-server`)');

    const tableTest = agent1.tests?.find(t => t.name?.includes('tables exist'));
    if (tableTest?.status === 'FAIL') fixes.push('🔴 P1: Missing DB tables — run `psql $DATABASE_URL < server/db/schema.sql`');

    const reminderNote = agent1.tests?.find(t => t.name?.includes('tables exist'))?.detail || '';
    if (reminderNote.includes('reminders table missing')) {
      fixes.push('🟡 P2: reminders table is missing — add CREATE TABLE reminders to schema.sql and re-run migrations');
    }
  }

  // Check LLM
  const agent2 = agents.find(a => a.n === 2)?.data;
  if (agent2) {
    const llmTest = agent2.tests?.find(t => t.name?.includes('LLM simple call'));
    if (llmTest?.status === 'FAIL') fixes.push('🔴 P1: Together AI LLM is failing — verify TOGETHER_API_KEY in .env');

    const composioTest = agent2.tests?.find(t => t.name?.includes('Composio: fetch tools'));
    if (composioTest?.status === 'FAIL') fixes.push('🟡 P2: Composio tool fetch failing — verify COMPOSIO_API_KEY in .env');
  }

  // Telnyx fix
  if (telnyxStatus.includes('BROKEN')) {
    fixes.push('🟡 P2: Telnyx outbound SMS broken — top up account at telnyx.com and verify TELNYX_API_KEY. Server still processes messages correctly.');
  }

  if (fixes.length === 0) fixes.push('✅ No critical fixes needed — system appears healthy!');

  // --- Build the report ---
  const runDate = new Date().toISOString();
  const overallStatus = criticalBlockers.length === 0 ? '✅ HEALTHY' : `🔴 BLOCKED (${criticalBlockers.length} critical issue${criticalBlockers.length > 1 ? 's' : ''})`;

  const report = `# Wingman End-to-End Test Report
Generated: ${runDate}
Overall Status: **${overallStatus}**
Total: ${totalPass + totalFail} tests | ${totalPass} passed | ${totalFail} failed

---

## Summary Table

| Agent | Tests Run | Pass | Fail |
|-------|-----------|------|------|
${tableRows.join('\n')}
| **TOTAL** | **${totalPass + totalFail}** | **${totalPass}** | **${totalFail}** |

---

## Critical Blockers
${criticalBlockers.length === 0
  ? '_None — core SMS flow is operational._'
  : criticalBlockers.map(b => `- ❌ ${b}`).join('\n')}

---

## Warnings (Non-Critical)
${warnings.length === 0
  ? '_None._'
  : warnings.map(w => `- ⚠️ ${w}`).join('\n')}

---

## Telnyx Status
**Status:** ${telnyxStatus}

${telnyxDetails || '_No Telnyx data collected._'}

### What's needed to go live with outbound SMS:
1. Ensure Telnyx account has funds (telnyx.com → Billing)
2. Verify \`TELNYX_API_KEY\` in \`server/.env\` is correct
3. Verify \`TELNYX_PHONE_NUMBER\` is \`+17623201647\`
4. Set up Cloudflare Tunnel: \`cloudflared tunnel --url http://localhost:3001\`
5. Configure Telnyx webhook URL to your tunnel + \`/webhook/sms\`

---

## Recommended Fixes (Prioritized by Impact)

${fixes.map((f, i) => `${i + 1}. ${f}`).join('\n')}

---

## Test Details by Agent

${agents.map(({ n, data }) => {
  if (!data) return `### Agent ${n}\n_Results file missing._\n`;
  return `### Agent ${n} — ${data.name}\n${(data.tests || []).map(t => `- [${t.status}] ${t.name}${t.detail ? `\n  > ${t.detail}` : ''}`).join('\n')}\n`;
}).join('\n')}

---
*Generated by Wingman Agent 5 (Reviewer)*
`;

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report);

  console.log(report);
  console.log(`\nFINAL-REPORT.md written to ${REPORT_PATH}`);
}

run();

/**
 * Wingman E2E Test Runner
 * Orchestrates all 6 agents in correct dependency order:
 *   Phase 1: Agents 1, 2, 3 in parallel (infra + services + routes)
 *   Phase 2: Agent 4 (needs DB from Agent 1 — orchestrator/agentic loop)
 *   Phase 3: Agent 6 (Composio full integration — needs core services from Agent 2)
 *   Phase 4: Agent 5 (reviewer — reads all results)
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const TESTS_DIR = __dirname;
const ROOT_DIR = path.join(__dirname, '..');

// Load env from root .env (where all secrets live)
require('dotenv').config({ path: path.join(ROOT_DIR, '.env') });
const SERVER_DIR = path.join(ROOT_DIR, 'server');
const RESULTS_DIR = path.join(ROOT_DIR, 'test-results');

fs.mkdirSync(RESULTS_DIR, { recursive: true });

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶  Starting ${scriptName}...`);
    const child = spawn(
      process.execPath,
      [path.join(TESTS_DIR, scriptName)],
      { cwd: SERVER_DIR, stdio: 'inherit', env: process.env }
    );
    child.on('close', (code) => {
      if (code === 0 || code === 1) resolve(code); // 1 = test failures (not crash)
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3001/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('\n⚙  Starting Wingman server...');
    const srv = spawn(process.execPath, ['index.js'], {
      cwd: SERVER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      detached: false,
    });

    srv.stdout.on('data', d => process.stdout.write(`  [server] ${d}`));
    srv.stderr.on('data', d => process.stderr.write(`  [server:err] ${d}`));

    // Wait up to 8s for server to become healthy
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const alive = await checkServer();
      if (alive) {
        clearInterval(poll);
        console.log('  Server is up!\n');
        resolve(srv);
      } else if (attempts >= 16) {
        clearInterval(poll);
        srv.kill();
        reject(new Error('Server did not start within 8 seconds'));
      }
    }, 500);

    srv.on('error', (err) => { clearInterval(poll); reject(err); });
    srv.on('close', (code) => {
      clearInterval(poll);
      if (attempts < 16) reject(new Error(`Server exited early with code ${code}`));
    });
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Wingman End-to-End Test Suite              ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Check if server is already running
  const alreadyUp = await checkServer();
  let serverProcess = null;

  if (alreadyUp) {
    console.log('\n✓ Server already running at localhost:3001');
  } else {
    try {
      serverProcess = await startServer();
    } catch (err) {
      console.error('\n✗ Could not start server:', err.message);
      console.error('  Make sure PostgreSQL and Redis are running, then try again.');
      process.exit(1);
    }
  }

  // Phase 1: Run Agents 1, 2, 3 in parallel
  console.log('\n═══ Phase 1: Infrastructure + Services + Routes (parallel) ═══');
  const t1 = Date.now();
  await Promise.allSettled([
    runScript('agent1-infra.js'),
    runScript('agent2-services.js'),
    runScript('agent3-routes.js'),
  ]);
  console.log(`\n Phase 1 done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  // Phase 2: Agent 4 — Orchestrator (needs DB to be confirmed working)
  console.log('\n═══ Phase 2: Orchestrator/Agentic Loop ═══');
  const t2 = Date.now();
  await runScript('agent4-orchestrator.js').catch(err => {
    console.error('Agent 4 error:', err.message);
  });
  console.log(`\n Phase 2 done in ${((Date.now() - t2) / 1000).toFixed(1)}s`);

  // Phase 3: Agent 6 — Composio Full Integration
  console.log('\n═══ Phase 3: Composio Full Integration ═══');
  const t3 = Date.now();
  await runScript('agent6-composio-full.js').catch(err => {
    console.error('Agent 6 error:', err.message);
  });
  console.log(`\n Phase 3 done in ${((Date.now() - t3) / 1000).toFixed(1)}s`);

  // Phase 4: Agent 5 — Reviewer
  console.log('\n═══ Phase 4: Reviewer ═══');
  await runScript('agent5-reviewer.js');

  // Cleanup server if we started it
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    console.log('\n Server stopped.');
  }

  // Print report path
  const reportPath = path.join(RESULTS_DIR, 'FINAL-REPORT.md');
  if (fs.existsSync(reportPath)) {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log(`║  FINAL-REPORT.md: ${RESULTS_DIR.slice(-40)} ║`);
    console.log('╚══════════════════════════════════════════════╝');
  }

  console.log('\n✅ All agents complete.\n');
}

main().catch(err => {
  console.error('\nFATAL run-all error:', err);
  process.exit(1);
});

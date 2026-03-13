#!/usr/bin/env node
'use strict';
/**
 * obsidian-sync.js
 * Auto-doc generator: syncs Wingman project state → Obsidian vault
 * Usage: node scripts/obsidian-sync.js --vault <path> [--event <event-name>]
 */

const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const vaultIdx = args.indexOf('--vault');
const eventIdx = args.indexOf('--event');
const VAULT = vaultIdx >= 0 ? args[vaultIdx + 1] : 'C:/Users/ivatu/ObsidianVault/Wingman';
const EVENT = eventIdx >= 0 ? args[eventIdx + 1] : 'manual';

const WINGMAN_ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(WINGMAN_ROOT, 'server');
const MOBILE_DIR = path.join(WINGMAN_ROOT, 'mobile');
const TEST_RESULTS = path.join(WINGMAN_ROOT, 'test-results', 'FINAL-REPORT.md');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[obsidian-sync] wrote: ${filePath.replace(VAULT, '$VAULT')}`);
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function listDir(dir, ext = '.js') {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(f => f.isFile() && (ext ? f.name.endsWith(ext) : true))
      .map(f => f.name);
  } catch { return []; }
}

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 16);
}

function getTodayDate() {
  return new Date().toISOString().substring(0, 10);
}

// Mirror test results
function syncTestResults() {
  const dest = path.join(VAULT, 'Tests', 'test-results-latest.md');
  const src = readFile(TEST_RESULTS);
  if (src) {
    writeFile(dest, `# Latest Test Results\n\n*Mirrored from test-results/FINAL-REPORT.md*\n*Last sync: ${getTimestamp()}*\n\n---\n\n${src}`);
  }
}

// Build server file map
function syncServerMap() {
  const dirs = ['routes', 'services', 'workers', 'db', 'scripts'];
  let content = `# Server Directory Map\n\n*Auto-updated: ${getTimestamp()}*\n\n`;

  for (const dir of dirs) {
    const fullDir = path.join(SERVER_DIR, dir);
    const files = listDir(fullDir);
    if (files.length) {
      content += `## ${dir}/\n`;
      for (const f of files) {
        content += `- \`${dir}/${f}\`\n`;
      }
      content += '\n';
    }
  }

  // Root files
  const rootFiles = listDir(SERVER_DIR);
  if (rootFiles.length) {
    content += `## root/\n`;
    for (const f of rootFiles) content += `- \`${f}\`\n`;
  }

  writeFile(path.join(VAULT, 'Files', 'server-map.md'), content);
}

// Build mobile file map
function syncMobileMap() {
  if (!fs.existsSync(MOBILE_DIR)) return;
  const dirs = ['app', 'app/onboarding', 'app/(tabs)', 'src', 'assets'];
  let content = `# Mobile Directory Map\n\n*Auto-updated: ${getTimestamp()}*\n\n`;

  for (const dir of dirs) {
    const fullDir = path.join(MOBILE_DIR, dir);
    const files = listDir(fullDir, '');
    if (files.length) {
      content += `## ${dir}/\n`;
      for (const f of files) content += `- \`${dir}/${f}\`\n`;
      content += '\n';
    }
  }

  writeFile(path.join(VAULT, 'Files', 'mobile-map.md'), content);
}

// Create/update session note
function syncSession() {
  const today = getTodayDate();
  const sessionFile = path.join(VAULT, 'Sessions', `${today}-sync.md`);

  // Don't overwrite existing detailed session notes
  if (fs.existsSync(sessionFile)) {
    // Append event log
    const existing = readFile(sessionFile);
    const newLine = `- ${getTimestamp()} — ${EVENT} event\n`;
    writeFile(sessionFile, existing + newLine);
  } else {
    writeFile(sessionFile, `# Session: ${today}\n\n## Event Log\n- ${getTimestamp()} — ${EVENT} event\n`);
  }
}

// Update INDEX
function syncIndex() {
  const sessionsDir = path.join(VAULT, 'Sessions');
  let sessions = '';
  try {
    sessions = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('.md'))
      .sort().reverse().slice(0, 10)
      .map(f => `- [[Sessions/${f.replace('.md', '')}]]`)
      .join('\n');
  } catch {}

  const content = `# Wingman Knowledge Graph\n\n*Last updated: ${getTimestamp()}*\n\n## Architecture\n- [[Architecture/system-overview]] — Stack, services, data flow\n- [[Architecture/composio-integration]] — 1003 apps, tool routing, OAuth\n- [[Architecture/mobile-app]] — Expo stack, screens, Pip mascot\n\n## ADRs\n- [[Architecture/decisions/ADR-001-llm-choice]]\n- [[Architecture/decisions/ADR-002-composio-vs-zapier]]\n- [[Architecture/decisions/ADR-003-keyword-routing-threshold]]\n\n## Recent Sessions\n${sessions}\n\n## Files\n- [[Files/server-map]] — Server directory (auto-updated)\n- [[Files/mobile-map]] — Mobile directory (auto-updated)\n\n## Tests\n- [[Tests/test-results-latest]] — Latest test run results\n\n## Roadmap\n- [[Roadmap/backlog]] — Pending features + fixes\n\n---\n*Auto-updated by \`scripts/obsidian-sync.js\`*\n`;

  writeFile(path.join(VAULT, '00-INDEX.md'), content);
}

async function main() {
  console.log(`[obsidian-sync] vault=${VAULT} event=${EVENT}`);
  ensureDir(VAULT);

  syncTestResults();
  syncServerMap();
  syncMobileMap();
  syncSession();
  syncIndex();

  console.log('[obsidian-sync] done.');
}

main().catch(e => { console.error('[obsidian-sync] error:', e.message); process.exit(1); });

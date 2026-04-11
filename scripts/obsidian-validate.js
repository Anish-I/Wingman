#!/usr/bin/env node
'use strict';
/**
 * obsidian-validate.js
 * Runs on Stop hook. Checks that Obsidian was written to during this response.
 * Warns if today's thread file wasn't updated recently.
 */

const fs = require('fs');
const path = require('path');

const VAULT = process.argv[2] || 'C:/Users/ivatu/ObsidianVault/Wingman';
const THREADS_DIR = path.join(VAULT, 'Threads');
const today = new Date().toISOString().substring(0, 10);
const threadFile = path.join(THREADS_DIR, `${today}.md`);

try {
  const stat = fs.statSync(threadFile);
  const ageMs = Date.now() - stat.mtimeMs;
  const ageSec = Math.round(ageMs / 1000);

  if (ageSec > 120) {
    // Thread file exists but wasn't updated in the last 2 minutes — warn
    process.stdout.write(`<obsidian-warning>⚠ Obsidian thread not updated in ${ageSec}s. You MUST write to ${threadFile} before finishing.</obsidian-warning>`);
    process.exit(0);
  }
  // Recently updated — good
  process.exit(0);
} catch {
  // Thread file doesn't exist at all
  process.stdout.write(`<obsidian-warning>⚠ No Obsidian thread for today. Create ${threadFile} NOW.</obsidian-warning>`);
  process.exit(0);
}

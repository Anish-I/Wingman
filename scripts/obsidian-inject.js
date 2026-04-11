#!/usr/bin/env node
'use strict';
/**
 * obsidian-inject.js
 * Runs on UserPromptSubmit hook.
 * Reads Obsidian vault state and outputs a directive for Claude
 * to write back to Obsidian after every response.
 */

const fs = require('fs');
const path = require('path');

const VAULT = process.argv[2] || 'C:/Users/ivatu/ObsidianVault/Wingman';
const TOPICS_DIR = path.join(VAULT, 'Topics');
const SESSIONS_DIR = path.join(VAULT, 'Sessions');
const THREADS_DIR = path.join(VAULT, 'Threads');

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function safeReadDir(d) { try { return fs.readdirSync(d).filter(f => f.endsWith('.md')); } catch { return []; } }

// Get today's date
const today = new Date().toISOString().substring(0, 10);

// Read existing topics for graph awareness
const topics = safeReadDir(TOPICS_DIR).map(f => f.replace('.md', ''));

// Read today's thread file to get conversation continuity
const threadFile = path.join(THREADS_DIR, `${today}.md`);
const todayThread = safeRead(threadFile);
const threadEntryCount = todayThread ? (todayThread.match(/^## \d{2}:\d{2}/gm) || []).length : 0;

// Read recent session for context
const sessions = safeReadDir(SESSIONS_DIR).sort().reverse().slice(0, 3);
let recentSessionSummaries = '';
for (const s of sessions) {
  const content = safeRead(path.join(SESSIONS_DIR, s));
  if (content) {
    // Extract just the summary line if it exists
    const summaryMatch = content.match(/^## Summary\n([\s\S]*?)(?=\n## |\n---|\Z)/m);
    if (summaryMatch) {
      recentSessionSummaries += `- ${s.replace('.md','')}: ${summaryMatch[1].trim().substring(0, 150)}\n`;
    }
  }
}

// Output the directive
// Thread-entry writes are now delegated to Gemma 4 via the Stop hook
// (gemma4-thread-writer.py). You should NOT write thread entries inline —
// just answer the user. Topic node creation is still your responsibility
// when you learn something new and worth promoting to a [[wikilink]].
const output = `<obsidian-memory-context>
Obsidian vault: ${VAULT}
Today's thread: ${threadFile} (${threadEntryCount} entries today)
Existing topic nodes (link with [[TopicName]] when relevant):
${topics.length ? topics.map(t => `[[${t}]]`).join(', ') : '(none yet)'}

Recent context:
${recentSessionSummaries || '(no recent sessions)'}

Thread entries are auto-written by Gemma 4 on session Stop — do NOT write
them inline. You only need to:
  - Create/update topic nodes in ${TOPICS_DIR} when a new topic emerges
  - Add to ${VAULT}/Knowledge/ when you learn something non-obvious
  - Reference [[TopicName]] in your responses where it helps the graph
</obsidian-memory-context>`;

process.stdout.write(output);

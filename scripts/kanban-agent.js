#!/usr/bin/env node
/**
 * Kanban Agent Loop
 *
 * Reads kanban/board.json, picks the first `todo` task assigned to `claude-code`,
 * runs Claude Code with the task context, and manages the task lifecycle:
 *   todo → in_progress → review
 *
 * Usage: node scripts/kanban-agent.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BOARD_PATH = path.join(__dirname, '../kanban/board.json');
const LOGS_DIR = path.join(__dirname, '../kanban/logs');

function readBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf-8'));
}

function writeBoard(board) {
  fs.writeFileSync(BOARD_PATH, JSON.stringify(board, null, 2) + '\n');
}

function moveTask(board, taskId, newColumn) {
  const task = board.tasks.find(t => t.id === taskId);
  if (task) task.column = newColumn;
  writeBoard(board);
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

async function main() {
  if (!fs.existsSync(BOARD_PATH)) {
    console.error('Board not found at', BOARD_PATH);
    process.exit(1);
  }

  const board = readBoard();

  // Find first todo task assigned to claude-code
  const task = board.tasks.find(
    t => t.column === 'todo' && t.assignee === 'claude-code'
  );

  if (!task) {
    console.log('No tasks in todo column assigned to claude-code. Nothing to do.');
    process.exit(0);
  }

  console.log(`\nPicked task: ${task.id} — ${task.title}`);
  console.log(`Priority: ${task.priority} | Labels: ${task.labels.join(', ')}`);

  // Read context file
  const contextPath = path.join(__dirname, '..', task.context_file);
  let context = '';
  if (fs.existsSync(contextPath)) {
    context = fs.readFileSync(contextPath, 'utf-8');
  } else {
    console.warn(`Context file not found: ${contextPath}`);
    context = `Task: ${task.title}\n\nDescription: ${task.description}`;
  }

  // Move to in_progress
  moveTask(board, task.id, 'in_progress');
  console.log(`Moved ${task.id} → in_progress`);

  // Create feature branch
  const branchName = `feature/${task.id}-${slugify(task.title)}`;
  try {
    execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
  } catch {
    // Branch may already exist
    try {
      execSync(`git checkout ${branchName}`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`Failed to create/checkout branch: ${err.message}`);
    }
  }

  // Prepare log directory
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, `${task.id}.log`);

  // Build prompt for Claude Code
  const prompt = [
    `You are working on task ${task.id}: ${task.title}`,
    '',
    'Task context:',
    context,
    '',
    'Instructions:',
    '- Read the relevant files mentioned in the context',
    '- Implement the fix or feature described',
    '- Run any relevant tests to verify',
    '- Keep changes minimal and focused',
  ].join('\n');

  console.log(`\nRunning Claude Code for ${task.id}...`);
  console.log(`Log: ${logFile}\n`);

  try {
    const output = execSync(
      `claude --permission-mode bypassPermissions --print ${JSON.stringify(prompt)}`,
      {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 10 * 60 * 1000, // 10 min timeout
      }
    );

    fs.writeFileSync(logFile, output);
    console.log(`Claude Code output saved to ${logFile}`);

    // Stage and commit changes
    try {
      execSync('git add -A', { stdio: 'inherit' });
      execSync(
        `git commit -m "feat(${task.id}): ${task.title}"`,
        { stdio: 'inherit' }
      );
      console.log('Changes committed.');
    } catch {
      console.log('No changes to commit (or commit failed).');
    }

    // Push branch and open PR
    try {
      execSync(`git push -u origin ${branchName}`, { stdio: 'inherit' });
      const prUrl = execSync(
        `gh pr create --title "${task.id}: ${task.title}" --body "Automated PR for kanban task ${task.id}.\n\nSee kanban/context/${task.id}.md for details." --base dev`,
        { encoding: 'utf-8' }
      ).trim();
      console.log(`PR created: ${prUrl}`);
    } catch (err) {
      console.warn(`Push/PR creation failed: ${err.message}`);
    }

    // Move to review
    const updatedBoard = readBoard();
    moveTask(updatedBoard, task.id, 'review');
    console.log(`Moved ${task.id} → review`);

  } catch (err) {
    fs.writeFileSync(logFile, `ERROR: ${err.message}\n\n${err.stdout || ''}\n${err.stderr || ''}`);
    console.error(`Task failed: ${err.message}`);
    console.log(`Error log saved to ${logFile}`);
    // Keep in in_progress so it can be retried
  }

  // Switch back to main
  try {
    execSync('git checkout main', { stdio: 'inherit' });
  } catch {}

  console.log('\nKanban agent loop complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

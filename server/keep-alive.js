#!/usr/bin/env node
/**
 * Server keep-alive wrapper
 * Restarts the server if it crashes
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('./services/logger');

let serverProcess = null;
let attemptCount = 0;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY = 2000; // 2 seconds

function startServer() {
  attemptCount++;
  console.log(`[keep-alive] Starting server (attempt ${attemptCount}/${MAX_RESTART_ATTEMPTS})`);

  serverProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit', // Inherit stdio so logs pass through
  });

  serverProcess.on('exit', (code) => {
    logger.error({ code }, '[keep-alive] Server exited');

    if (attemptCount < MAX_RESTART_ATTEMPTS) {
      console.log(`[keep-alive] Restarting in ${RESTART_DELAY}ms...`);
      setTimeout(startServer, RESTART_DELAY);
    } else {
      logger.error(`[keep-alive] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Giving up.`);
      process.exit(1);
    }
  });

  serverProcess.on('error', (err) => {
    logger.error({ err: err.message }, '[keep-alive] Failed to start server');
  });
}

// Handle signals
process.on('SIGINT', () => {
  console.log('[keep-alive] Received SIGINT, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[keep-alive] Received SIGTERM, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

// Start the server
startServer();

'use strict';

const MAX_CONCURRENCY = 3;
const MAX_QUEUE_DEPTH = parseInt(process.env.LLM_MAX_QUEUE_DEPTH || '50', 10);
const QUEUE_TIMEOUT_MS = parseInt(process.env.LLM_QUEUE_TIMEOUT_MS || '30000', 10);
let running = 0;
const waiting = [];

function drain() {
  while (waiting.length > 0 && running < MAX_CONCURRENCY) {
    const entry = waiting.shift();
    if (entry.cancelled) continue;
    clearTimeout(entry.timer);
    running++;
    execute(entry.fn, entry.resolve, entry.reject);
  }
}

function execute(fn, resolve, reject) {
  console.log(`[llm-queue] depth: ${waiting.length}, processing: ${running}`);
  fn()
    .then(resolve, reject)
    .finally(() => {
      running--;
      drain();
    });
}

function queueLLMCall(fn, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (running < MAX_CONCURRENCY) {
      running++;
      execute(fn, resolve, reject);
    } else if (waiting.length >= MAX_QUEUE_DEPTH) {
      const err = new Error('Server is busy, please try again shortly.');
      err.status = 429;
      reject(err);
    } else {
      const entry = { fn, resolve, reject, cancelled: false, timer: null };

      entry.timer = setTimeout(() => {
        entry.cancelled = true;
        const idx = waiting.indexOf(entry);
        if (idx !== -1) waiting.splice(idx, 1);
        const err = new Error('Queued LLM request timed out.');
        err.status = 504;
        reject(err);
      }, QUEUE_TIMEOUT_MS);

      if (signal) {
        if (signal.aborted) {
          const err = new Error('Request cancelled while queued.');
          err.status = 499;
          reject(err);
          return;
        }
        signal.addEventListener('abort', () => {
          if (entry.cancelled) return;
          entry.cancelled = true;
          clearTimeout(entry.timer);
          const idx = waiting.indexOf(entry);
          if (idx !== -1) waiting.splice(idx, 1);
          const err = new Error('Request cancelled while queued.');
          err.status = 499;
          reject(err);
        }, { once: true });
      }

      waiting.push(entry);
      console.log(`[llm-queue] Queued request. depth: ${waiting.length}, processing: ${running}`);
    }
  });
}

module.exports = { queueLLMCall };

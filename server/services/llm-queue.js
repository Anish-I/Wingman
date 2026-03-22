'use strict';

const MAX_CONCURRENCY = 3;
let running = 0;
const waiting = [];

function drain() {
  while (waiting.length > 0 && running < MAX_CONCURRENCY) {
    const { fn, resolve, reject } = waiting.shift();
    execute(fn, resolve, reject);
  }
}

function execute(fn, resolve, reject) {
  running++;
  console.log(`[llm-queue] depth: ${waiting.length}, processing: ${running}`);
  fn()
    .then(resolve, reject)
    .finally(() => {
      running--;
      drain();
    });
}

function queueLLMCall(fn) {
  return new Promise((resolve, reject) => {
    if (running < MAX_CONCURRENCY) {
      execute(fn, resolve, reject);
    } else {
      waiting.push({ fn, resolve, reject });
      console.log(`[llm-queue] Queued request. depth: ${waiting.length}, processing: ${running}`);
    }
  });
}

module.exports = { queueLLMCall };

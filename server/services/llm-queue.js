'use strict';

const MAX_CONCURRENCY = 3;
let running = 0;
const waiting = [];

function queueLLMCall(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      running++;
      console.log(`[llm-queue] depth: ${waiting.length}, processing: ${running}`);
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      } finally {
        running--;
        if (waiting.length > 0) {
          const next = waiting.shift();
          next();
        }
      }
    };

    if (running < MAX_CONCURRENCY) {
      run();
    } else {
      waiting.push(run);
      console.log(`[llm-queue] Queued request. depth: ${waiting.length}, processing: ${running}`);
    }
  });
}

module.exports = { queueLLMCall };

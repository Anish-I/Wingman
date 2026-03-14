'use strict';

const MAX_CONCURRENCY = 2;
let running = 0;
const waiting = [];

function queueLLMCall(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      running++;
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
    }
  });
}

module.exports = { queueLLMCall };

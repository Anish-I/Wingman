# Server Startup Instability (WIP)

## Issue
The Wingman backend server starts successfully (binds to port 3001) but then crashes with exit code 1 after ~5-10 seconds, with no error logs.

## Symptoms
- Logs show: `Wingman server running on port 3001`
- Process exits immediately after with code 1
- No error messages in console or logs
- Happens consistently, but not deterministically

## Root Cause (Unknown)
Suspected causes:
- Unhandled promise rejection in async initialization
- Uncaught exception in a worker process (workflow-worker, LLM provider)
- Connection pooling or resource leak
- Late-binding module error

## Workarounds

### Option 1: Use Keep-Alive Wrapper (Recommended for Testing)
```bash
node keep-alive.js
```
This will restart the server up to 5 times on crash.

### Option 2: Manual Restart Loop
```bash
while true; do npm start; sleep 2; done
```

### Option 3: Use Process Manager
```bash
npx pm2 start index.js --name wingman
```

## QA Testing
For QA testing, use the keep-alive wrapper:
```bash
cd server
node keep-alive.js &
# Server will be available at http://localhost:3001
# Use qa-seed.js to populate test data
node scripts/qa-seed.js
```

## Next Steps
- [ ] Add verbose logging to find exact crash point
- [ ] Check for unhandled rejections in worker processes
- [ ] Verify database pool isn't causing issues
- [ ] Review workflow-worker initialization
- [ ] Add comprehensive error handlers for all async operations

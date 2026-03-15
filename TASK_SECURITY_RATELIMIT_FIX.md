# Task: Deep Investigation + Security Audit + Fix Rate Limit Message

## PRIORITY 1: Kill "⚠️ API rate limit reached. Please try again later."

This message keeps appearing. Do a COMPLETE investigation:

1. Search EVERY file in server/ for this exact string:
   grep -r "rate limit reached" server/ --include="*.js"
   grep -r "API rate limit" server/ --include="*.js"
   grep -r "⚠️" server/ --include="*.js"

2. Search for it in node_modules too (could be a package):
   grep -r "rate limit reached" node_modules/ --include="*.js" -l

3. Check ALL error handlers, middleware, routes — not just llm.js
   Look in: routes/sms.js, routes/api.js, services/orchestrator.js, 
   services/llm.js, workers/workflow-worker.js, server/index.js

4. Check if BullMQ scheduled jobs are calling old LLM code paths that still have the old error message

5. Check Redis for any queued messages containing this string:
   node -e "const R=require('./node_modules/ioredis');const r=new R('redis://localhost:6380',{maxRetriesPerRequest:null});r.keys('*').then(async keys=>{for(const k of keys){const v=await r.get(k);if(v&&v.includes('rate limit')){console.log(k,v)}}r.quit()})"

6. Check stub message log for the exact source:
   GET http://localhost:3001/stub/messages/%2B19168675309

7. Once found — remove it completely. Replace ALL instances with:
   "One sec, try again in a moment."
   No ⚠️. No "API". No "rate limit". Just friendly.

8. Add a global safety net in server/index.js error handler:
   Any response text going to users that contains "rate limit", "429", "API error", 
   "overloaded" → replace with "One sec, try again in a moment." before sending

## PRIORITY 2: Fix CI (failing on dev branch)

The CI fails because server/package.json has no proper test script.

Fix:
1. Install jest as devDependency in server/: npm install --save-dev jest
2. Create server/tests/health.test.js:
```js
describe('Server health', () => {
  test('health endpoint returns ok', async () => {
    // Simple module import test - no running server needed
    const db = require('../db');
    expect(db).toBeDefined();
    expect(db.query).toBeInstanceOf(Function);
  });

  test('LLM service loads', () => {
    const llm = require('../services/llm');
    expect(llm.callLLM).toBeInstanceOf(Function);
  });

  test('orchestrator loads', () => {
    const orch = require('../services/orchestrator');
    expect(orch.processMessage).toBeInstanceOf(Function);
  });
});
```
3. Update server/package.json scripts.test to: "jest --forceExit --testTimeout=10000"
4. Push to dev branch and verify CI goes green

## PRIORITY 3: Security Audit

Check for these specific issues:

### A. Secrets in code/git history
- Search for hardcoded API keys, passwords, tokens in *.js files
- Check .gitignore covers .env properly
- Run: git log --all --full-history -- .env (should show nothing - .env should never have been committed)
- Check git log for any accidentally committed secrets: git log --all -p | grep -E "(API_KEY|SECRET|PASSWORD|TOKEN)=" | head -20

### B. Input validation gaps
- Check all POST routes — are they validating body types?
- Check for SQL injection risks in db/queries.js (should use parameterized queries)
- Check for XSS in any string concatenation into responses

### C. Auth security
- JWT_SECRET in .env is "your_jwt_secret_here" — that's the default placeholder. Generate a real one and update it.
- Check token expiry — should be reasonable (24h is fine, 30 days is too long)
- Verify OTP is deleted after use (not reusable)

### D. Rate limiting
- Verify global rate limiter is working (100 req/15min)
- Verify SMS webhook rate limit (20/min) is working
- Verify OTP rate limit (5/15min) is working

### E. WEBHOOK_SECRET placeholder
- WEBHOOK_SECRET=your_webhook_secret_here — generate a real one

### F. Dependency vulnerabilities
- Run: npm audit --workspace=server
- Fix any HIGH or CRITICAL vulnerabilities

### G. Environment variable exposure
- Ensure no env vars are logged in plain text (check console.log statements)
- The [REDACTED] pattern in logs is good — verify it covers all sensitive keys

## PRIORITY 4: Fix repo structure

1. Ensure .gitignore is comprehensive:
```
node_modules/
.env
.env.local
.env.*.local
server.log
server-err.log
tunnel.log
tunnel-err.log
test-token.txt
kanban/logs/
TASK_*.md
CLAUDE_TASK.md
*.log
```

2. Remove any TASK_*.md files from git tracking (they're internal agent task files)
   git rm --cached TASK_*.md CLAUDE_TASK.md 2>/dev/null || true

3. Add a proper README.md update with:
   - Project overview
   - Setup instructions (Redis via Docker, .env setup)
   - Branch strategy (main/dev/prod)
   - How to run locally
   - How to run tests

4. Generate secure secrets:
   - Generate JWT_SECRET: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   - Generate WEBHOOK_SECRET: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   - Update .env with generated values (NOT committed to git)

## PRIORITY 5: Push everything

git add -A
git commit -m "fix: kill rate limit message, security hardening, CI test suite, repo cleanup"
git push origin main
git push origin dev

## FINAL OUTPUT
Print:
RATE_LIMIT_MSG: [where it was found, how it was fixed]
CI: [passing/failing, what was fixed]
SECURITY_ISSUES: [list of issues found and fixed]
SECRETS_GENERATED: [yes/no]
PUSHED: [commit hash]

When done: openclaw system event --text "Done: security audit + rate limit message killed" --mode now

#!/bin/bash
cd /c/Users/ivatu/Wingman && claude --permission-mode bypassPermissions --print "You are working on the Wingman server at C:/Users/ivatu/Wingman/server. Fix two security issues from SECURITY-AUDIT.md in routes/api.js:

**M4: Add per-user rate limiting to expensive endpoints**
The /api/chat, /api/workflows/plan, and /api/workflows/:id/run endpoints have no per-user rate limits. An authenticated user can exhaust LLM credits by spamming.
Fix: Add rate limiters using express-rate-limit (already a dependency). Use req.user.id as the key generator for per-user limiting. Suggested limits:
- /api/chat: 30 requests per 15 minutes per user
- /api/workflows/plan and /api/workflows/:id/run: 20 requests per 15 minutes per user

**M6: Whitelist allowed preference keys in PATCH /api/user/preferences**
Currently req.body is passed directly to updateUserPreferences() with no validation. An attacker could inject arbitrary keys.
Fix: Whitelist allowed keys: ['timezone', 'theme', 'language', 'notifications', 'smsOptIn']. Only pass through those keys. Return 400 if the request contains unrecognized keys or if the filtered body is empty.

Steps:
1. Read routes/api.js to understand the current code
2. Read package.json to confirm express-rate-limit is available
3. Implement both fixes in routes/api.js
4. Run lint/type-check if available
5. Run tests if available
6. git add server/routes/api.js
7. git commit with message: 'security: per-user rate limits on chat/workflow endpoints plus preferences key whitelist'
8. git push origin main

When completely finished run: openclaw system event --text 'Done: Added per-user rate limits plus preference key whitelist - pushed to main' --mode now"

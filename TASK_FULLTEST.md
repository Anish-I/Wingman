# Full System Test + Kanban Agent Loop

## Obsidian Vault: C:/Users/ivatu/ObsidianVault/Wingman
Log everything to:
- Testing/full-test-report.md — every test case, input, output, pass/fail
- DevOps/kanban.md — kanban task progress updates

## Server
- Already running on port 3001 (stub provider, Redis 7 on 6380, Supabase DB)
- If not running, start it: Start-Process node -ArgumentList "server/index.js" -WorkingDirectory "C:/Users/ivatu/Wingman" -RedirectStandardOutput "C:/Users/ivatu/Wingman/server.log" -RedirectStandardError "C:/Users/ivatu/Wingman/server-err.log" -NoNewWindow -PassThru

## PART 1: COMPREHENSIVE TEST SUITE

Run ALL of these test cases. For each one log: input, expected output, actual output, PASS/FAIL, notes.

### AUTH TESTS
- TC-001: Request OTP for new phone number → {success:true}
- TC-002: Request OTP for existing user → {success:true}  
- TC-003: Verify with correct OTP → {success:true, token:string}
- TC-004: Verify with wrong OTP → 401 error
- TC-005: Verify with expired OTP (use wrong code) → 401 error
- TC-006: Request OTP with invalid phone format → 400 error
- TC-007: Access protected route without token → 401 error
- TC-008: Access protected route with invalid token → 401 error

### SMS / ONBOARDING TESTS
- TC-009: New user sends first SMS → discovery message with wingman.app/start link
- TC-010: Same user sends second SMS (not onboarded) → same discovery message path
- TC-011: After marking onboarded, user sends SMS → LLM response (not discovery)
- TC-012: SMS with phone number in wrong format → 400 error
- TC-013: SMS body > 1600 chars → 400 error

### LLM / ORCHESTRATOR TESTS
- TC-014: Simple greeting → friendly response
- TC-015: "What can you help me with?" → capabilities summary
- TC-016: "Remind me to drink water every hour" → confirmation + workflow created
- TC-017: "Send an email to john@example.com saying hello" → attempts Composio Gmail tool
- TC-018: "What's the weather?" → attempts weather tool or apologizes gracefully
- TC-019: Complex multi-step request → handles gracefully
- TC-020: Very long message (500 chars) → handles without crashing

### WORKFLOW TESTS
- TC-021: POST /api/workflows/plan - "Send daily weather at 9am" → workflow with cron 0 9 * * *
- TC-022: POST /api/workflows/plan - "Email me weekly report every Monday" → cron 0 9 * * 1
- TC-023: POST /api/workflows/plan - "manual task: send me a summary" → trigger_type: manual
- TC-024: GET /api/workflows → returns array with created workflows
- TC-025: POST /api/workflows/:id/run → returns triggered status
- TC-026: GET /api/workflows after run → workflow still in list, active=true
- TC-027: PATCH /api/workflows/:id (active:false) → workflow paused
- TC-028: GET /api/workflows after pause → active=false
- TC-029: PATCH /api/workflows/:id/pause → workflow cancelled
- TC-030: GET /api/workflows after cancel → status=cancelled

### WORKFLOW PERSISTENCE TESTS
- TC-031: Create workflow, restart server, GET /api/workflows → workflow still exists (DB persisted)
- TC-032: Workflow run creates run record → GET workflow runs from DB directly

### STUB SMS TESTS
- TC-033: GET /stub/messages/:phone → returns message history array
- TC-034: Multiple messages → history grows correctly
- TC-035: Message history has correct from/to/body/timestamp fields

### RATE LIMIT / RETRY TESTS
- TC-036: Fire 5 rapid LLM requests → all succeed (retry logic handles any 429s)
- TC-037: Check server logs → no unhandled errors

### COMPOSIO TESTS
- TC-038: GET /api/apps → returns connection status object
- TC-039: Request action requiring unconnected app → graceful error message to user

### KANBAN AGENT TESTS
- TC-040: Read kanban/board.json → valid JSON with tasks array
- TC-041: Run node scripts/kanban-agent.js → picks up WING-001, moves to in_progress
- TC-042: Check kanban/board.json after run → WING-001 status updated

## PART 2: KANBAN AGENT LOOP

After running all tests:

1. Run: `node scripts/kanban-agent.js` from C:/Users/ivatu/Wingman
2. Watch what it does — log the output
3. Check if WING-001 (Fix Composio app connections) is picked up and worked on
4. Check if a git branch was created: feature/WING-001-*
5. Check if a PR was opened on GitHub

If kanban-agent.js has bugs, fix them first.

## PART 3: FIX ANYTHING BROKEN

Fix every failing test case. Don't skip.

## PART 4: OBSIDIAN REPORT

Write to C:/Users/ivatu/ObsidianVault/Wingman/Testing/full-test-report.md:
- Full table of all 42 test cases: TC-ID | Description | Status | Notes
- Summary: X/42 passing
- List of bugs found and fixed
- List of known limitations

## PART 5: PUSH

git add -A
git commit -m "test: full 42-case test suite, kanban agent loop verified"
git push origin main

## FINAL OUTPUT

Print this exact format:
TOTAL: X/42 passed
FAILED: [TC-IDs]
FIXED THIS RUN: [list]
KANBAN: [what happened with WING-001]
OBSIDIAN: updated

Then run: openclaw system event --text "Done: 42-case test suite complete" --mode now

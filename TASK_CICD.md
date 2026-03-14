# Task: CI/CD + Branch Strategy + PR Review System + Kanban Agent Loop

## Obsidian Vault: C:/Users/ivatu/ObsidianVault/Wingman
Log all decisions, configs, and results there under:
- DevOps/ci-cd.md
- DevOps/branch-strategy.md
- DevOps/pr-review-system.md
- DevOps/kanban.md

## Repo
- C:/Users/ivatu/Wingman
- GitHub: https://github.com/Anish-I/Wingman
- Current branch: main (only branch)

---

## TASK 1: Branch Strategy

Create the following branches from main:
- `dev` — active development branch
- `prod` — mirrors main, production-only merges

Push all branches to GitHub.

Set up branch protection rules via GitHub CLI (`gh`):
- `prod` branch: require PR, require CI to pass, no direct pushes
- `dev` branch: require CI to pass

---

## TASK 2: GitHub Actions CI/CD

Create `.github/workflows/` with these files:

### ci.yml — runs on push to dev and PRs targeting prod
```
name: CI
on:
  push:
    branches: [dev]
  pull_request:
    branches: [prod, main]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: wingman
          POSTGRES_PASSWORD: wingman
          POSTGRES_DB: wingman
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install
      - run: npm test --workspace=server
        env:
          NODE_ENV: test
          REDIS_URL: redis://localhost:6379
          DATABASE_URL: postgresql://wingman:wingman@localhost:5432/wingman
          JWT_SECRET: ci-test-secret
          MESSAGING_PROVIDER: stub
          TOGETHER_API_KEY: ${{ secrets.TOGETHER_API_KEY }}
          COMPOSIO_API_KEY: ${{ secrets.COMPOSIO_API_KEY }}
```

### deploy-prod.yml — deploys when PR merged to prod
```
name: Deploy to Production
on:
  push:
    branches: [prod]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: echo "Add your deployment step here (Railway/Render/Fly.io/etc)"
```

### pr-review.yml — auto-triggers Claude Code PR review on new PRs
```
name: AI PR Review
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: AI Review
        uses: actions/github-script@v7
        with:
          script: |
            const { execSync } = require('child_process');
            const diff = execSync('git diff origin/${{ github.base_ref }}...HEAD').toString();
            // Post a placeholder review comment — replace with actual LLM call in prod
            await github.rest.pulls.createReview({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              body: `## 🤖 Automated PR Review\n\n_AI review triggered. Diff size: ${diff.length} chars._\n\nReview pending — connect Claude Code agent for full analysis.`,
              event: 'COMMENT'
            });
```

---

## TASK 3: PR Review System (Engineer-style)

Create `scripts/review-pr.js` — a script that:
1. Takes a PR number as argument: `node scripts/review-pr.js 42`
2. Uses `gh pr diff <number>` to get the diff
3. Calls Together AI (using the existing llm.js service) with a code review prompt
4. Posts the review back as a GitHub PR comment via `gh pr comment`

Review prompt should cover:
- Logic bugs or edge cases
- Security issues (SQL injection, unvalidated input, auth gaps)
- Performance concerns
- Code style / consistency with existing patterns
- Missing tests
- Suggestions for improvement

Also create `scripts/review-pr.ps1` as a PowerShell wrapper.

---

## TASK 4: Kanban Task System

Create `kanban/` directory in project root with:

### kanban/board.json
A JSON kanban board with columns: backlog, todo, in_progress, review, done
Pre-populate with real tasks from the known-issues in Obsidian:
- Fix Composio app connections (todo)
- Add test isolation (reset test DB between runs) (backlog)
- Connect production deployment target (backlog)
- Set up monitoring/alerting (backlog)
- Implement workflow retry logic (todo)
- Add rate limiting to workflow runs (backlog)

Format:
```json
{
  "columns": ["backlog", "todo", "in_progress", "review", "done"],
  "tasks": [
    {
      "id": "WING-001",
      "title": "...",
      "description": "...",
      "column": "todo",
      "priority": "high|medium|low",
      "labels": ["backend", "composio", etc],
      "assignee": "claude-code",
      "created_at": "<ISO date>",
      "context_file": "kanban/context/WING-001.md"
    }
  ]
}
```

### kanban/context/WING-XXX.md (one per task)
Detailed context file for each task so Claude Code can pick it up and work on it autonomously. Include:
- Problem description
- Relevant files
- Acceptance criteria
- Related code paths

### scripts/kanban-agent.js
A script that:
1. Reads kanban/board.json
2. Finds first task in `todo` column assigned to `claude-code`
3. Reads its context file
4. Runs: `claude --permission-mode bypassPermissions --print "<task context>"`
5. Moves task to `in_progress` while running, then `review` when done
6. Logs output to kanban/logs/WING-XXX.log
7. Creates a git branch `feature/WING-XXX-<slug>`, commits changes, opens a PR

---

## TASK 5: Fix known issues

### Fix 1: Composio test — graceful handling
In `server/services/composio.js`, check the `getConnectionStatus` response — currently returns `{connected:[], missing:[]}` even for valid users. Investigate why and add better error messages.

### Fix 2: E2E test isolation
In any existing test files (tests/ directory), add a beforeEach/afterEach that:
- Creates a unique test phone number per run (e.g. +1555TIMESTAMP)
- Cleans up that user from DB after tests

---

## TASK 6: Push everything

git add -A
git commit -m "feat: CI/CD pipeline, PR review system, kanban agent loop, branch strategy"
git push origin main
git push origin dev
git push origin prod

---

## TASK 7: Obsidian docs

Update Obsidian vault with:
- DevOps/ci-cd.md — full CI/CD setup, workflow files explained
- DevOps/branch-strategy.md — prod/dev/main strategy
- DevOps/pr-review-system.md — how to use scripts/review-pr.js
- DevOps/kanban.md — how the kanban agent loop works, how to add tasks

---

## Final output

Print:
COMPLETED: [list]
SKIPPED/BLOCKED: [list]
GITHUB BRANCHES: [list]
KANBAN TASKS CREATED: [list]
NEXT STEPS: [list]

Then run: openclaw system event --text "Done: CI/CD + kanban agent system built" --mode now

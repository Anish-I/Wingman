# Agent Hub API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend orchestrator API that manages agents, user stories, logs, and screenshots — serving as the data layer for the read-only dashboard and the engine for the agent loop.

**Architecture:** Express + TypeScript API on port 5002, using PostgreSQL (agent_hub schema in existing wingman DB) via Prisma, BullMQ + Redis for scheduled agent jobs. SSE endpoint for real-time activity feed. Read-only REST API for dashboard consumption.

**Tech Stack:** Node.js, TypeScript, Express, Prisma, BullMQ, ioredis, SSE

**Spec:** `docs/superpowers/specs/2026-03-21-agent-hub-design.md`

---

## File Structure

```
C:\Users\ivatu\agent-hub\
├── package.json                    # Root package (not monorepo yet — API first)
├── tsconfig.json
├── prisma/
│   └── schema.prisma               # Database schema (agents, stories, logs)
├── src/
│   ├── index.ts                     # Express server entry, port 5002
│   ├── lib/
│   │   ├── prisma.ts                # Prisma client singleton
│   │   ├── redis.ts                 # ioredis connection
│   │   └── sse.ts                   # SSE broadcast manager
│   ├── routes/
│   │   ├── stories.ts               # GET /api/stories, /api/stories/:id
│   │   ├── agents.ts                # GET /api/agents, /api/agents/:id
│   │   ├── activity.ts              # GET /api/activity (SSE), GET /api/logs
│   │   ├── screenshots.ts           # GET /api/screenshots/:path (static serve)
│   │   └── health.ts                # GET /api/health
│   ├── services/
│   │   ├── story.service.ts         # CRUD for user stories
│   │   ├── agent.service.ts         # Agent status management
│   │   ├── log.service.ts           # Logging + SSE broadcast
│   │   └── obsidian.service.ts      # Markdown sync to Obsidian vault
│   ├── jobs/
│   │   ├── queue.ts                 # BullMQ queue definitions
│   │   └── agent-loop.job.ts        # Agent cycle job processor (scan→analyze→story→implement→retest)
│   └── types/
│       └── index.ts                 # Shared TypeScript types/enums
├── screenshots/                     # Screenshot storage directory
├── tests/
│   ├── services/
│   │   ├── story.service.test.ts
│   │   ├── agent.service.test.ts
│   │   ├── log.service.test.ts
│   │   └── obsidian.service.test.ts
│   ├── routes/
│   │   ├── stories.test.ts
│   │   ├── agents.test.ts
│   │   └── health.test.ts
│   └── setup.ts                     # Test DB setup/teardown
└── .env
```

---

### Task 1: Project Scaffold & Database Schema

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Create: `src/types/index.ts`
- Create: `.env`

- [ ] **Step 1: Initialize project**

```bash
mkdir -p C:\Users\ivatu\agent-hub
cd C:\Users\ivatu\agent-hub
npm init -y
npm install express cors dotenv @prisma/client ioredis bullmq uuid
npm install -D typescript tsx @types/express @types/cors @types/node @types/uuid prisma vitest
npx tsc --init
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .env**

```env
DATABASE_URL="postgresql://POSTGRES_USER:POSTGRES_PASSWORD@localhost:5432/wingman?schema=agent_hub"
DIRECT_URL="postgresql://POSTGRES_USER:POSTGRES_PASSWORD@localhost:5432/wingman?schema=agent_hub"
REDIS_URL="redis://localhost:6379"
PORT=5002
OBSIDIAN_VAULT="C:/Users/ivatu/ObsidianVault"
SCREENSHOTS_DIR="./screenshots"
```

- [ ] **Step 4: Create Prisma schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Project {
  wingman
  smartclips
}

enum Segment {
  ui
  security
  backend
  e2e
}

enum StoryStatus {
  backlog
  in_progress
  review
  done
  rejected
}

enum Priority {
  critical
  high
  medium
  low
}

enum AgentStatus {
  idle
  running
  error
  disabled
}

enum LogLevel {
  info
  warn
  error
  success
}

model Agent {
  id        String      @id
  name      String
  role      String
  project   String      // comma-separated if multiple
  status    AgentStatus @default(idle)
  lastRun   DateTime?   @map("last_run")
  config    Json        @default("{}")
  createdAt DateTime    @default(now()) @map("created_at")
  updatedAt DateTime    @updatedAt @map("updated_at")

  stories   UserStory[] @relation("CreatedBy")
  logs      AgentLog[]

  @@map("agents")
}

model UserStory {
  id           String      @id @default(uuid())
  project      Project
  segment      Segment
  title        String
  description  String
  status       StoryStatus @default(backlog)
  priority     Priority    @default(medium)
  createdById  String      @map("created_by_id")
  createdBy    Agent       @relation("CreatedBy", fields: [createdById], references: [id])
  assignedTo   String?     @map("assigned_to")
  findings     Json        @default("{}")
  screenshots  Json        @default("[]")  // Array of {before: path, after: path}
  retestResult Json?       @map("retest_result")
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt @map("updated_at")
  closedAt     DateTime?   @map("closed_at")

  @@index([project, status])
  @@index([segment])
  @@map("user_stories")
}

model AgentLog {
  id          String   @id @default(uuid())
  agentId     String   @map("agent_id")
  agent       Agent    @relation(fields: [agentId], references: [id])
  project     Project
  action      String
  detail      String   @default("")
  level       LogLevel @default(info)
  screenshots Json     @default("[]")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([agentId, createdAt])
  @@index([project, createdAt])
  @@map("agent_logs")
}
```

- [ ] **Step 5: Create Prisma client singleton**

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 6: Create shared types**

```typescript
// src/types/index.ts
export type { Agent, UserStory, AgentLog } from '@prisma/client';
export { Project, Segment, StoryStatus, Priority, AgentStatus, LogLevel } from '@prisma/client';

export interface StoryFilter {
  project?: string;
  segment?: string;
  status?: string;
}

export interface LogFilter {
  agentId?: string;
  project?: string;
  level?: string;
  limit?: number;
  offset?: number;
}

export interface SSEEvent {
  type: 'log' | 'story_update' | 'agent_status';
  data: unknown;
  timestamp: string;
}
```

- [ ] **Step 7: Generate Prisma client and push schema**

```bash
npx prisma generate
npx prisma db push
```

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold agent-hub with Prisma schema"
```

---

### Task 2: Core Services (Story, Agent, Log)

**Files:**
- Create: `src/services/story.service.ts`
- Create: `src/services/agent.service.ts`
- Create: `src/services/log.service.ts`
- Create: `src/lib/sse.ts`
- Create: `tests/services/story.service.test.ts`
- Create: `tests/services/agent.service.test.ts`

- [ ] **Step 1: Write story service tests**

```typescript
// tests/services/story.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StoryService } from '../../src/services/story.service';
import { prisma } from '../../src/lib/prisma';

describe('StoryService', () => {
  beforeAll(async () => {
    // Seed a test agent
    await prisma.agent.upsert({
      where: { id: 'test-agent' },
      update: {},
      create: { id: 'test-agent', name: 'Test Agent', role: 'tester', project: 'wingman' }
    });
  });

  afterAll(async () => {
    await prisma.agentLog.deleteMany({});
    await prisma.userStory.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.$disconnect();
  });

  it('creates a story', async () => {
    const story = await StoryService.create({
      project: 'wingman',
      segment: 'ui',
      title: 'Fix button alignment',
      description: 'The submit button is misaligned on mobile',
      priority: 'high',
      createdById: 'test-agent',
      findings: { severity: 'high', details: 'misaligned by 12px' }
    });
    expect(story.id).toBeDefined();
    expect(story.status).toBe('backlog');
    expect(story.title).toBe('Fix button alignment');
  });

  it('lists stories with filters', async () => {
    const stories = await StoryService.list({ project: 'wingman' });
    expect(stories.length).toBeGreaterThan(0);
  });

  it('updates story status', async () => {
    const stories = await StoryService.list({});
    const updated = await StoryService.updateStatus(stories[0].id, 'in_progress', 'claude-code');
    expect(updated.status).toBe('in_progress');
    expect(updated.assignedTo).toBe('claude-code');
  });

  it('closes a story', async () => {
    const stories = await StoryService.list({});
    const closed = await StoryService.updateStatus(stories[0].id, 'done');
    expect(closed.status).toBe('done');
    expect(closed.closedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/story.service.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement story service**

```typescript
// src/services/story.service.ts
import { prisma } from '../lib/prisma';
import { Project, Segment, Priority, StoryStatus, StoryFilter } from '../types';

interface CreateStoryInput {
  project: Project;
  segment: Segment;
  title: string;
  description: string;
  priority?: Priority;
  createdById: string;
  findings?: Record<string, unknown>;
  screenshots?: Array<{ before?: string; after?: string }>;
}

export class StoryService {
  static async create(input: CreateStoryInput) {
    return prisma.userStory.create({
      data: {
        project: input.project as Project,
        segment: input.segment as Segment,
        title: input.title,
        description: input.description,
        priority: (input.priority || 'medium') as Priority,
        createdById: input.createdById,
        findings: input.findings || {},
        screenshots: input.screenshots || [],
      },
      include: { createdBy: true },
    });
  }

  static async list(filter: StoryFilter) {
    return prisma.userStory.findMany({
      where: {
        ...(filter.project && { project: filter.project as Project }),
        ...(filter.segment && { segment: filter.segment as Segment }),
        ...(filter.status && { status: filter.status as StoryStatus }),
      },
      include: { createdBy: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  static async getById(id: string) {
    return prisma.userStory.findUnique({
      where: { id },
      include: { createdBy: true },
    });
  }

  static async updateStatus(id: string, status: StoryStatus | string, assignedTo?: string) {
    return prisma.userStory.update({
      where: { id },
      data: {
        status: status as StoryStatus,
        ...(assignedTo && { assignedTo }),
        ...(status === 'done' || status === 'rejected' ? { closedAt: new Date() } : {}),
      },
      include: { createdBy: true },
    });
  }

  static async addRetestResult(id: string, result: Record<string, unknown>) {
    return prisma.userStory.update({
      where: { id },
      data: { retestResult: result },
    });
  }

  static async addScreenshots(id: string, screenshots: Array<{ before?: string; after?: string }>) {
    const story = await prisma.userStory.findUnique({ where: { id } });
    const existing = (story?.screenshots as Array<unknown>) || [];
    return prisma.userStory.update({
      where: { id },
      data: { screenshots: [...existing, ...screenshots] },
    });
  }

  static async counts(project?: string) {
    const where = project ? { project: project as Project } : {};
    const [backlog, in_progress, review, done] = await Promise.all([
      prisma.userStory.count({ where: { ...where, status: 'backlog' } }),
      prisma.userStory.count({ where: { ...where, status: 'in_progress' } }),
      prisma.userStory.count({ where: { ...where, status: 'review' } }),
      prisma.userStory.count({ where: { ...where, status: 'done' } }),
    ]);
    return { backlog, in_progress, review, done, total: backlog + in_progress + review + done };
  }
}
```

- [ ] **Step 4: Implement agent service**

```typescript
// src/services/agent.service.ts
import { prisma } from '../lib/prisma';
import { AgentStatus } from '../types';

interface CreateAgentInput {
  id: string;
  name: string;
  role: string;
  project: string;
  config?: Record<string, unknown>;
}

export class AgentService {
  static async upsert(input: CreateAgentInput) {
    return prisma.agent.upsert({
      where: { id: input.id },
      update: { name: input.name, role: input.role, project: input.project, config: input.config || {} },
      create: { id: input.id, name: input.name, role: input.role, project: input.project, config: input.config || {} },
    });
  }

  static async list() {
    return prisma.agent.findMany({ orderBy: { name: 'asc' } });
  }

  static async getById(id: string) {
    return prisma.agent.findUnique({ where: { id } });
  }

  static async setStatus(id: string, status: AgentStatus | string) {
    return prisma.agent.update({
      where: { id },
      data: {
        status: status as AgentStatus,
        ...(status === 'running' ? { lastRun: new Date() } : {}),
      },
    });
  }
}
```

- [ ] **Step 5: Implement log service with SSE**

```typescript
// src/lib/sse.ts
import { Response } from 'express';

class SSEManager {
  private clients: Set<Response> = new Set();

  addClient(res: Response) {
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  broadcast(event: string, data: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}

export const sse = new SSEManager();
```

```typescript
// src/services/log.service.ts
import { prisma } from '../lib/prisma';
import { Project, LogLevel, LogFilter } from '../types';
import { sse } from '../lib/sse';

interface CreateLogInput {
  agentId: string;
  project: Project | string;
  action: string;
  detail?: string;
  level?: LogLevel | string;
  screenshots?: string[];
}

export class LogService {
  static async create(input: CreateLogInput) {
    const log = await prisma.agentLog.create({
      data: {
        agentId: input.agentId,
        project: input.project as Project,
        action: input.action,
        detail: input.detail || '',
        level: (input.level || 'info') as LogLevel,
        screenshots: input.screenshots || [],
      },
      include: { agent: true },
    });

    // Broadcast to SSE clients
    sse.broadcast('log', {
      id: log.id,
      agent: log.agent.name,
      agentId: log.agentId,
      project: log.project,
      action: log.action,
      detail: log.detail,
      level: log.level,
      timestamp: log.createdAt,
    });

    return log;
  }

  static async list(filter: LogFilter) {
    return prisma.agentLog.findMany({
      where: {
        ...(filter.agentId && { agentId: filter.agentId }),
        ...(filter.project && { project: filter.project as Project }),
        ...(filter.level && { level: filter.level as LogLevel }),
      },
      include: { agent: true },
      orderBy: { createdAt: 'desc' },
      take: filter.limit || 100,
      skip: filter.offset || 0,
    });
  }
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/services/
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: core services — story, agent, log with SSE"
```

---

### Task 3: Express Server & REST Routes

**Files:**
- Create: `src/index.ts`
- Create: `src/routes/stories.ts`
- Create: `src/routes/agents.ts`
- Create: `src/routes/activity.ts`
- Create: `src/routes/screenshots.ts`
- Create: `src/routes/health.ts`
- Create: `src/lib/redis.ts`

- [ ] **Step 1: Create Redis connection**

```typescript
// src/lib/redis.ts
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});
```

- [ ] **Step 2: Create route files**

```typescript
// src/routes/health.ts
import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'agent-hub', timestamp: new Date().toISOString() });
});

export default router;
```

```typescript
// src/routes/stories.ts
import { Router } from 'express';
import { StoryService } from '../services/story.service';

const router = Router();

router.get('/stories', async (req, res) => {
  const { project, segment, status } = req.query;
  const stories = await StoryService.list({
    project: project as string,
    segment: segment as string,
    status: status as string,
  });
  res.json(stories);
});

router.get('/stories/counts', async (req, res) => {
  const { project } = req.query;
  const counts = await StoryService.counts(project as string);
  res.json(counts);
});

router.get('/stories/:id', async (req, res) => {
  const story = await StoryService.getById(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  res.json(story);
});

export default router;
```

```typescript
// src/routes/agents.ts
import { Router } from 'express';
import { AgentService } from '../services/agent.service';

const router = Router();

router.get('/agents', async (req, res) => {
  const agents = await AgentService.list();
  res.json(agents);
});

router.get('/agents/:id', async (req, res) => {
  const agent = await AgentService.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

export default router;
```

```typescript
// src/routes/activity.ts
import { Router } from 'express';
import { LogService } from '../services/log.service';
import { sse } from '../lib/sse';

const router = Router();

// SSE endpoint for real-time activity
router.get('/activity/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: connected\ndata: {"status":"connected"}\n\n');
  sse.addClient(res);
});

// REST endpoint for historical logs
router.get('/logs', async (req, res) => {
  const { agentId, project, level, limit, offset } = req.query;
  const logs = await LogService.list({
    agentId: agentId as string,
    project: project as string,
    level: level as string,
    limit: limit ? parseInt(limit as string) : 100,
    offset: offset ? parseInt(offset as string) : 0,
  });
  res.json(logs);
});

export default router;
```

```typescript
// src/routes/screenshots.ts
import { Router } from 'express';
import path from 'path';
import express from 'express';

const router = Router();
const screenshotsDir = process.env.SCREENSHOTS_DIR || './screenshots';

router.use('/screenshots', express.static(path.resolve(screenshotsDir)));

export default router;
```

- [ ] **Step 3: Create Express server entry**

```typescript
// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRoutes from './routes/health';
import storyRoutes from './routes/stories';
import agentRoutes from './routes/agents';
import activityRoutes from './routes/activity';
import screenshotRoutes from './routes/screenshots';
import { AgentService } from './services/agent.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRoutes);
app.use('/api', storyRoutes);
app.use('/api', agentRoutes);
app.use('/api', activityRoutes);
app.use('/api', screenshotRoutes);

async function seedAgents() {
  const agents = [
    { id: 'tech-lead', name: 'Tech Lead', role: 'Orchestrates agent cycle, creates stories, retests completed work, reports to owner', project: 'wingman,smartclips' },
    { id: 'ui-agent', name: 'UI/UX Agent', role: 'Visual inspection — screenshots, design quality, animations, industry standards', project: 'wingman,smartclips' },
    { id: 'security-agent', name: 'Security Agent', role: 'Vulnerability scanning, OWASP issues, auth flows, data handling', project: 'wingman,smartclips' },
    { id: 'backend-agent', name: 'Backend Agent', role: 'API performance, error patterns, code quality, DB queries', project: 'wingman,smartclips' },
    { id: 'e2e-agent', name: 'E2E Testing Agent', role: 'Functional verification of user flows via browser automation (2hr loop)', project: 'wingman,smartclips' },
  ];
  for (const agent of agents) {
    await AgentService.upsert(agent);
  }
  console.log(`Seeded ${agents.length} agents`);
}

async function start() {
  await seedAgents();
  app.listen(PORT, () => {
    console.log(`Agent Hub API running on http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
    console.log(`SSE: http://localhost:${PORT}/api/activity/stream`);
  });
}

start().catch(console.error);
```

- [ ] **Step 4: Add scripts to package.json**

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 5: Test the server starts**

```bash
npm run dev &
sleep 5
curl http://localhost:5002/api/health
curl http://localhost:5002/api/agents
```
Expected: health OK, 5 agents returned

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Express server with REST routes and SSE"
```

---

### Task 4: Obsidian Sync Service

**Files:**
- Create: `src/services/obsidian.service.ts`
- Create: `tests/services/obsidian.service.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/services/obsidian.service.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { ObsidianService } from '../../src/services/obsidian.service';
import fs from 'fs';
import path from 'path';

const testVault = './test-vault';

describe('ObsidianService', () => {
  afterAll(() => {
    fs.rmSync(testVault, { recursive: true, force: true });
  });

  it('syncs a story to markdown', async () => {
    const service = new ObsidianService(testVault);
    await service.syncStory({
      id: 'test-123',
      project: 'wingman',
      segment: 'ui',
      title: 'Fix button alignment',
      description: 'Button is misaligned',
      status: 'backlog',
      priority: 'high',
      createdBy: { name: 'UI Agent' },
      findings: { severity: 'high' },
      createdAt: new Date('2026-03-21'),
      updatedAt: new Date('2026-03-21'),
    });

    const filePath = path.join(testVault, 'Wingman', 'agent-hub', 'test-123.md');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('Fix button alignment');
    expect(content).toContain('status: backlog');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/obsidian.service.test.ts
```

- [ ] **Step 3: Implement Obsidian sync**

```typescript
// src/services/obsidian.service.ts
import fs from 'fs';
import path from 'path';

interface StoryForSync {
  id: string;
  project: string;
  segment: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdBy: { name: string };
  findings: Record<string, unknown>;
  retestResult?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
}

export class ObsidianService {
  private vaultPath: string;

  constructor(vaultPath?: string) {
    this.vaultPath = vaultPath || process.env.OBSIDIAN_VAULT || 'C:/Users/ivatu/ObsidianVault';
  }

  async syncStory(story: StoryForSync) {
    const projectName = story.project.charAt(0).toUpperCase() + story.project.slice(1);
    const dir = path.join(this.vaultPath, projectName, 'agent-hub');
    fs.mkdirSync(dir, { recursive: true });

    const frontmatter = [
      '---',
      `id: ${story.id}`,
      `title: "${story.title}"`,
      `project: ${story.project}`,
      `segment: ${story.segment}`,
      `status: ${story.status}`,
      `priority: ${story.priority}`,
      `created_by: ${story.createdBy.name}`,
      `created: ${story.createdAt.toISOString().split('T')[0]}`,
      `updated: ${story.updatedAt.toISOString().split('T')[0]}`,
      ...(story.closedAt ? [`closed: ${story.closedAt.toISOString().split('T')[0]}`] : []),
      '---',
    ].join('\n');

    const body = [
      `# ${story.title}`,
      '',
      `**Status**: ${story.status} | **Priority**: ${story.priority} | **Segment**: ${story.segment}`,
      '',
      '## Description',
      story.description,
      '',
      '## Findings',
      '```json',
      JSON.stringify(story.findings, null, 2),
      '```',
      ...(story.retestResult ? [
        '',
        '## Retest Result',
        '```json',
        JSON.stringify(story.retestResult, null, 2),
        '```',
      ] : []),
    ].join('\n');

    fs.writeFileSync(path.join(dir, `${story.id}.md`), `${frontmatter}\n\n${body}\n`);
    await this.updateIndex(dir, story.project);
  }

  private async updateIndex(dir: string, project: string) {
    const files = fs.readdirSync(dir).filter(f => f !== 'INDEX.md' && f.endsWith('.md'));
    const lines = files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      const titleMatch = content.match(/^# (.+)$/m);
      const statusMatch = content.match(/^status: (.+)$/m);
      return `- [[${f.replace('.md', '')}]] — ${statusMatch?.[1] || '?'} — ${titleMatch?.[1] || f}`;
    });
    fs.writeFileSync(path.join(dir, 'INDEX.md'), `# Agent Hub Stories — ${project}\n\n${lines.join('\n')}\n`);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/services/obsidian.service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Obsidian sync service for story markdown export"
```

---

### Task 5: Agent Loop Job (BullMQ)

**Files:**
- Create: `src/jobs/queue.ts`
- Create: `src/jobs/agent-loop.job.ts`

- [ ] **Step 1: Create queue definitions**

```typescript
// src/jobs/queue.ts
import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis';

const connection = { connection: redis };

export const agentLoopQueue = new Queue('agent-loop', connection);

export function createAgentLoopWorker(processor: (job: any) => Promise<void>) {
  return new Worker('agent-loop', processor, {
    ...connection,
    concurrency: 1, // One agent cycle at a time
  });
}
```

- [ ] **Step 2: Create agent loop job processor**

This is a placeholder that defines the loop structure. The actual CCB/OpenClaw integration comes in Plan 3.

```typescript
// src/jobs/agent-loop.job.ts
import { Job } from 'bullmq';
import { AgentService } from '../services/agent.service';
import { StoryService } from '../services/story.service';
import { LogService } from '../services/log.service';
import { ObsidianService } from '../services/obsidian.service';

const obsidian = new ObsidianService();

interface AgentLoopData {
  agentId: string;
  project: string;
  segment: string;
}

export async function processAgentLoop(job: Job<AgentLoopData>) {
  const { agentId, project, segment } = job.data;

  await AgentService.setStatus(agentId, 'running');
  await LogService.create({
    agentId,
    project,
    action: 'cycle_start',
    detail: `Starting ${segment} scan for ${project}`,
    level: 'info',
  });

  try {
    // Step 1: Scan (OpenClaw screenshots — implemented in Plan 3)
    await LogService.create({ agentId, project, action: 'scan', detail: 'Scanning...', level: 'info' });
    // TODO: OpenClaw browser screenshot integration

    // Step 2: Analyze (Codex via CCB — implemented in Plan 3)
    await LogService.create({ agentId, project, action: 'analyze', detail: 'Analyzing...', level: 'info' });
    // TODO: CCB delegation to Codex

    // Step 3: Create stories (Tech Lead reviews — implemented in Plan 3)
    await LogService.create({ agentId, project, action: 'create_stories', detail: 'Creating stories...', level: 'info' });
    // TODO: Story creation from analysis

    // Step 4: Implementation (Claude Code picks up — implemented in Plan 3)
    // Step 5: Retest (Tech Lead retests — implemented in Plan 3)

    await AgentService.setStatus(agentId, 'idle');
    await LogService.create({
      agentId,
      project,
      action: 'cycle_complete',
      detail: `Completed ${segment} cycle for ${project}`,
      level: 'success',
    });
  } catch (error) {
    await AgentService.setStatus(agentId, 'error');
    await LogService.create({
      agentId,
      project,
      action: 'cycle_error',
      detail: error instanceof Error ? error.message : String(error),
      level: 'error',
    });
  }
}
```

- [ ] **Step 3: Wire into server startup**

Add to `src/index.ts` after `seedAgents()`:

```typescript
import { agentLoopQueue, createAgentLoopWorker } from './jobs/queue';
import { processAgentLoop } from './jobs/agent-loop.job';

// In start():
const worker = createAgentLoopWorker(processAgentLoop);
console.log('Agent loop worker started');

// Schedule recurring jobs
const schedules = [
  { agentId: 'ui-agent', project: 'wingman', segment: 'ui', repeat: { every: 4 * 60 * 60 * 1000 } },
  { agentId: 'security-agent', project: 'wingman', segment: 'security', repeat: { every: 4 * 60 * 60 * 1000 } },
  { agentId: 'backend-agent', project: 'wingman', segment: 'backend', repeat: { every: 4 * 60 * 60 * 1000 } },
  { agentId: 'e2e-agent', project: 'wingman', segment: 'e2e', repeat: { every: 2 * 60 * 60 * 1000 } },
  { agentId: 'ui-agent', project: 'smartclips', segment: 'ui', repeat: { every: 4 * 60 * 60 * 1000 } },
  { agentId: 'security-agent', project: 'smartclips', segment: 'security', repeat: { every: 4 * 60 * 60 * 1000 } },
  { agentId: 'backend-agent', project: 'smartclips', segment: 'backend', repeat: { every: 4 * 60 * 60 * 1000 } },
  { agentId: 'e2e-agent', project: 'smartclips', segment: 'e2e', repeat: { every: 2 * 60 * 60 * 1000 } },
];

for (const schedule of schedules) {
  const { repeat, ...data } = schedule;
  await agentLoopQueue.add(`${data.agentId}-${data.project}`, data, {
    repeat,
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}
console.log(`Scheduled ${schedules.length} agent loop jobs`);
```

- [ ] **Step 4: Test server starts with worker**

```bash
npm run dev &
sleep 5
curl http://localhost:5002/api/health
curl http://localhost:5002/api/agents
```
Expected: All agents visible, health OK

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: BullMQ agent loop with scheduled jobs"
```

---

### Task 6: Git Remote & Push

- [ ] **Step 1: Create GitHub repo and push**

```bash
cd C:\Users\ivatu\agent-hub
gh repo create Anish-I/agent-hub --private --source=. --push
```

- [ ] **Step 2: Verify**

```bash
git log --oneline
```

---

## Next Plans

- **Plan 2: Dashboard Frontend** — Next.js static site with kanban, activity feed, screenshot viewer. Deploys to Cloudflare Pages.
- **Plan 3: Agent Integration** — Wire CCB/Codex delegation, OpenClaw browser automation, Claude Code story pickup, Telegram reporting.

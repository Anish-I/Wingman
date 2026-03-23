#!/usr/bin/env node
/**
 * Database seed script for local development.
 *
 * Usage:
 *   node scripts/seed.js          # insert seed data (idempotent)
 *   node scripts/seed.js --reset  # delete seed user's data, then re-seed
 */

require('dotenv').config();
const { Pool } = require('pg');

const SEED_USER = {
  id: 1,
  phone: '+15005550006',
  name: 'Test User',
};

const SEED_WORKFLOWS = [
  {
    name: 'Morning briefing at 9am',
    description: 'Sends a daily morning briefing with weather, calendar, and top news.',
    trigger_type: 'cron',
    cron_expression: '0 9 * * *',
    actions: JSON.stringify([
      { type: 'llm', prompt: 'Give me a morning briefing with weather, calendar events, and top headlines.' },
    ]),
  },
  {
    name: 'Daily calendar summary',
    description: 'Summarises today\'s calendar events every morning at 8am.',
    trigger_type: 'cron',
    cron_expression: '0 8 * * *',
    actions: JSON.stringify([
      { type: 'llm', prompt: 'Summarise my calendar events for today.' },
    ]),
  },
  {
    name: 'Weekly task review',
    description: 'Reviews open tasks and priorities every Monday at 10am.',
    trigger_type: 'cron',
    cron_expression: '0 10 * * 1',
    actions: JSON.stringify([
      { type: 'llm', prompt: 'Review my open tasks and help me prioritise for the week.' },
    ]),
  },
];

async function seed(pool, reset) {
  const created = [];
  const skipped = [];

  if (reset) {
    console.log('--reset flag detected: cleaning seed data...');
    await pool.query('DELETE FROM workflows WHERE user_id = $1', [SEED_USER.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [SEED_USER.id]);
    console.log('  Deleted existing seed data.\n');
  }

  // Seed user
  const userResult = await pool.query(
    `INSERT INTO users (id, phone, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [SEED_USER.id, SEED_USER.phone, SEED_USER.name]
  );

  if (userResult.rowCount > 0) {
    created.push(`User: ${SEED_USER.name}`);
  } else {
    skipped.push(`User: ${SEED_USER.name} (already exists)`);
  }

  // Seed workflows
  for (const wf of SEED_WORKFLOWS) {
    const wfResult = await pool.query(
      `INSERT INTO workflows (user_id, name, description, trigger_type, cron_expression, actions)
       SELECT $1, $2, $3, $4, $5, $6::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM workflows WHERE user_id = $1 AND name = $2
       )
       RETURNING id`,
      [SEED_USER.id, wf.name, wf.description, wf.trigger_type, wf.cron_expression, wf.actions]
    );

    if (wfResult.rowCount > 0) {
      created.push(`Workflow: "${wf.name}"`);
    } else {
      skipped.push(`Workflow: "${wf.name}" (already exists)`);
    }
  }

  // Summary
  console.log('=== Seed complete ===');
  if (created.length) {
    console.log('\nCreated:');
    created.forEach((c) => console.log(`  + ${c}`));
  }
  if (skipped.length) {
    console.log('\nSkipped:');
    skipped.forEach((s) => console.log(`  - ${s}`));
  }
  if (!created.length && !skipped.length) {
    console.log('  Nothing to do.');
  }
}

async function main() {
  const reset = process.argv.includes('--reset');

  const isSupabase = (process.env.DATABASE_URL || '').includes('supabase.co');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isSupabase ? { rejectUnauthorized: true } : false,
  });

  try {
    await seed(pool, reset);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

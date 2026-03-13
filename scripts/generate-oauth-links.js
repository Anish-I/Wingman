/**
 * generate-oauth-links.js
 *
 * Checks connection status for the 'default' Composio entity and generates
 * OAuth links for all disconnected apps across the most useful categories.
 *
 * Usage (from project root):
 *   node scripts/generate-oauth-links.js
 *
 * Output:
 *   - Console: grouped links by category
 *   - File: oauth-links.txt in project root
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Composio } = require('composio-core');
const fs = require('fs');

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const OUTPUT_FILE = path.join(__dirname, '..', 'oauth-links.txt');
const ENTITY_ID = 'default';

if (!COMPOSIO_API_KEY) {
  console.error('ERROR: COMPOSIO_API_KEY is not set in .env');
  process.exit(1);
}

// ─── App catalogue by category ────────────────────────────────────────────────
// Only the most common/useful 35 apps; excludes obscure or API-key-only services.
const CATEGORIES = {
  Communication: [
    'slack', 'discord', 'telegram', 'whatsapp', 'microsoft_teams', 'zoom', 'outlook',
  ],
  Productivity: [
    'notion', 'todoist', 'asana', 'trello', 'linear', 'clickup', 'monday', 'jira',
  ],
  Google: [
    'googlecalendar', 'googledrive', 'googledocs', 'googlesheets', 'googletasks',
  ],
  Storage: [
    'dropbox', 'one_drive', 'box',
  ],
  Dev: [
    'github', 'gitlab', 'bitbucket', 'sentry',
  ],
  CRM: [
    'hubspot', 'salesforce', 'pipedrive', 'attio',
  ],
  Finance: [
    'stripe', 'quickbooks', 'xero',
  ],
  Social: [
    'twitter', 'linkedin', 'reddit', 'instagram',
  ],
  'AI / Search': [
    'perplexityai', 'tavily', 'serpapi',
  ],
};

// Flat list of all apps we care about
const ALL_APPS = Object.values(CATEGORIES).flat();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches the set of ACTIVE app names for an entity directly from the
 * Composio REST API (mirrors the implementation in server/services/composio.js).
 */
async function getConnectedApps(entityId) {
  const res = await fetch(
    `https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${entityId}&pageSize=100`,
    { headers: { 'x-api-key': COMPOSIO_API_KEY } }
  );
  if (!res.ok) throw new Error(`Composio API returned ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return new Set(
    (data.items || [])
      .filter(c => c.status === 'ACTIVE')
      .map(c => c.appName.toLowerCase())
  );
}

/**
 * Generate an OAuth redirect URL for the given entity + app.
 * Returns null on error (with a reason string in the second slot).
 */
async function generateLink(entityId, appName) {
  try {
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    const entity = await client.getEntity(entityId);
    const conn = await entity.initiateConnection({ appName });
    return [conn.redirectUrl, null];
  } catch (err) {
    return [null, err.message || String(err)];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Wingman — Composio OAuth Link Generator         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // 1. Determine what is already connected
  console.log(`Checking connection status for entity: ${ENTITY_ID} …`);
  let connectedApps;
  try {
    connectedApps = await getConnectedApps(ENTITY_ID);
  } catch (err) {
    console.error('Failed to fetch connection status:', err.message);
    process.exit(1);
  }

  const alreadyConnected = ALL_APPS.filter(a => connectedApps.has(a.toLowerCase()));
  const toConnect = ALL_APPS.filter(a => !connectedApps.has(a.toLowerCase()));

  console.log(`\nAlready connected (${alreadyConnected.length}): ${alreadyConnected.join(', ') || 'none'}`);
  console.log(`Need OAuth links (${toConnect.length}): ${toConnect.join(', ')}\n`);

  if (toConnect.length === 0) {
    console.log('All target apps are already connected. Nothing to do.');
    return;
  }

  // 2. Generate links for every disconnected app, grouped by category
  const outputLines = [];
  const stats = { success: 0, skipped: 0, errors: [] };

  const header = `Wingman OAuth Connection Links\nGenerated: ${new Date().toISOString()}\nEntity: ${ENTITY_ID}\n${'='.repeat(60)}`;
  outputLines.push(header);
  console.log('Generating OAuth links …\n');

  for (const [category, apps] of Object.entries(CATEGORIES)) {
    const disconnectedInCat = apps.filter(a => !connectedApps.has(a.toLowerCase()));
    if (disconnectedInCat.length === 0) {
      console.log(`[${category}] — all connected, skipping`);
      stats.skipped += apps.length;
      continue;
    }

    const catHeader = `\n── ${category} ${'─'.repeat(Math.max(0, 50 - category.length))}`;
    outputLines.push(catHeader);
    console.log(catHeader);

    for (const app of disconnectedInCat) {
      process.stdout.write(`  ${app.padEnd(20)} → `);
      const [url, err] = await generateLink(ENTITY_ID, app);

      if (url) {
        const line = `${app}: ${url}`;
        outputLines.push(line);
        console.log(url);
        stats.success++;
      } else {
        const line = `${app}: ERROR — ${err}`;
        outputLines.push(line);
        console.log(`ERROR: ${err}`);
        stats.errors.push({ app, err });
      }
    }
  }

  // 3. Summary
  const summaryLines = [
    '',
    '='.repeat(60),
    `Summary`,
    `  Generated successfully : ${stats.success}`,
    `  Already connected      : ${alreadyConnected.length}`,
    `  Errors                 : ${stats.errors.length}`,
  ];
  if (stats.errors.length > 0) {
    summaryLines.push('  Failed apps:');
    stats.errors.forEach(({ app, err }) => summaryLines.push(`    • ${app}: ${err}`));
  }
  summaryLines.push('');
  summaryLines.push('Open each link in a browser to complete the OAuth flow.');
  summaryLines.push('Once authorized, Composio persists the connection indefinitely.');

  outputLines.push(...summaryLines);

  const summaryText = summaryLines.join('\n');
  console.log('\n' + summaryText);

  // 4. Write to file
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf8');
  console.log(`\nLinks written to: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});

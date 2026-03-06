#!/usr/bin/env node
/**
 * Wingman n8n Workflow Setup
 * Automatically creates all standard Wingman workflows in n8n via API.
 * Run: node server/scripts/setup-n8n.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { randomUUID } = require('crypto');

const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.error('❌  N8N_API_KEY not set in .env');
  process.exit(1);
}

const headers = { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${N8N_BASE}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`n8n ${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow definitions
// Each sticky note encodes WINGMAN metadata so n8n.js can build typed schemas.
// ─────────────────────────────────────────────────────────────────────────────

function node(name, type, typeVersion, position, parameters, credentials) {
  const n = { id: randomUUID(), name, type, typeVersion, position, parameters };
  if (credentials) n.credentials = credentials;
  return n;
}

function stickyMeta(meta) {
  return node('Wingman Meta', 'n8n-nodes-base.stickyNote', 1, [0, 60], {
    content: JSON.stringify(meta),
    height: 180,
    width: 380,
  });
}

// ── 1. Send Email ─────────────────────────────────────────────────────────────
const sendEmailWorkflow = {
  name: 'Wingman: Send Email',
  nodes: [
    stickyMeta({
      wingman: {
        description: 'Send an email to any email address on behalf of the user',
        schema: {
          to:      { type: 'string', description: 'recipient email address' },
          subject: { type: 'string', description: 'email subject line' },
          body:    { type: 'string', description: 'email body text' },
        },
      },
    }),
    node('Webhook', 'n8n-nodes-base.webhook', 2, [240, 300], {
      httpMethod: 'POST',
      path: 'wingman-send-email',
      responseMode: 'responseNode',
      options: {},
    }),
    node('Send Gmail', 'n8n-nodes-base.gmail', 2, [520, 300], {
      operation: 'send',
      sendTo: '={{ $json.body.to }}',
      subject: '={{ $json.body.subject }}',
      message: '={{ $json.body.body }}',
      emailType: 'text',
      options: {},
    }),
    node('Respond', 'n8n-nodes-base.respondToWebhook', 1, [800, 300], {
      respondWith: 'json',
      responseBody: '={"success":true,"message":"Email sent to {{ $json.body.to }}"}',
    }),
  ],
  connections: {
    Webhook:     { main: [[{ node: 'Send Gmail', type: 'main', index: 0 }]] },
    'Send Gmail':{ main: [[{ node: 'Respond',    type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

// ── 2. Get Calendar Events ────────────────────────────────────────────────────
const getCalendarWorkflow = {
  name: 'Wingman: Get Calendar Events',
  nodes: [
    stickyMeta({
      wingman: {
        description: "Get the user's upcoming calendar events for today or a specified date",
        schema: {
          date: { type: 'string', description: 'Date to check events for (YYYY-MM-DD). Defaults to today if omitted.' },
        },
      },
    }),
    node('Webhook', 'n8n-nodes-base.webhook', 2, [240, 300], {
      httpMethod: 'POST',
      path: 'wingman-get-calendar',
      responseMode: 'responseNode',
      options: {},
    }),
    node('Get Events', 'n8n-nodes-base.googleCalendar', 1, [520, 300], {
      resource: 'event',
      operation: 'getAll',
      calendarId: { __rl: true, value: 'primary', mode: 'list' },
      timeMin: '={{ $json.body.date ? $json.body.date + "T00:00:00Z" : new Date().toISOString().split("T")[0] + "T00:00:00Z" }}',
      timeMax: '={{ $json.body.date ? $json.body.date + "T23:59:59Z" : new Date().toISOString().split("T")[0] + "T23:59:59Z" }}',
      options: { maxResults: 10 },
    }),
    node('Respond', 'n8n-nodes-base.respondToWebhook', 1, [800, 300], {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify($input.all().map(i => i.json)) }}',
    }),
  ],
  connections: {
    Webhook:      { main: [[{ node: 'Get Events', type: 'main', index: 0 }]] },
    'Get Events': { main: [[{ node: 'Respond',    type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

// ── 3. Create Calendar Event ──────────────────────────────────────────────────
const createEventWorkflow = {
  name: 'Wingman: Create Calendar Event',
  nodes: [
    stickyMeta({
      wingman: {
        description: "Create a new event on the user's Google Calendar",
        schema: {
          title:            { type: 'string', description: 'event title / name' },
          start:            { type: 'string', description: 'start datetime ISO 8601 e.g. 2025-06-15T14:00:00' },
          end:              { type: 'string', description: 'end datetime ISO 8601 e.g. 2025-06-15T15:00:00' },
          description:      { type: 'string', description: 'optional event description or notes' },
          attendees:        { type: 'string', description: 'comma-separated email addresses of attendees (optional)' },
        },
      },
    }),
    node('Webhook', 'n8n-nodes-base.webhook', 2, [240, 300], {
      httpMethod: 'POST',
      path: 'wingman-create-event',
      responseMode: 'responseNode',
      options: {},
    }),
    node('Create Event', 'n8n-nodes-base.googleCalendar', 1, [520, 300], {
      resource: 'event',
      operation: 'create',
      calendarId: { __rl: true, value: 'primary', mode: 'list' },
      start: '={{ $json.body.start }}',
      end:   '={{ $json.body.end }}',
      additionalFields: {
        summary:     '={{ $json.body.title }}',
        description: '={{ $json.body.description || "" }}',
        attendees:   '={{ ($json.body.attendees || "").split(",").filter(Boolean).map(e => ({ email: e.trim() })) }}',
      },
    }),
    node('Respond', 'n8n-nodes-base.respondToWebhook', 1, [800, 300], {
      respondWith: 'json',
      responseBody: '={"success":true,"event":{"title":"{{ $json.summary }}","id":"{{ $json.id }}","link":"{{ $json.htmlLink }}"}}',
    }),
  ],
  connections: {
    Webhook:        { main: [[{ node: 'Create Event', type: 'main', index: 0 }]] },
    'Create Event': { main: [[{ node: 'Respond',      type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

// ── 4. Web Search ─────────────────────────────────────────────────────────────
const webSearchWorkflow = {
  name: 'Wingman: Web Search',
  nodes: [
    stickyMeta({
      wingman: {
        description: 'Search the web and return a summary of the top results',
        schema: {
          query: { type: 'string', description: 'search query' },
        },
      },
    }),
    node('Webhook', 'n8n-nodes-base.webhook', 2, [240, 300], {
      httpMethod: 'POST',
      path: 'wingman-web-search',
      responseMode: 'responseNode',
      options: {},
    }),
    node('DuckDuckGo Search', 'n8n-nodes-base.httpRequest', 4, [520, 300], {
      method: 'GET',
      url: 'https://api.duckduckgo.com/',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'q',      value: '={{ $json.body.query }}' },
          { name: 'format', value: 'json' },
          { name: 'no_redirect', value: '1' },
        ],
      },
      options: {},
    }),
    node('Respond', 'n8n-nodes-base.respondToWebhook', 1, [800, 300], {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ abstract: $json.Abstract, abstractText: $json.AbstractText, relatedTopics: ($json.RelatedTopics || []).slice(0,5).map(t => t.Text).filter(Boolean) }) }}',
    }),
  ],
  connections: {
    Webhook:               { main: [[{ node: 'DuckDuckGo Search', type: 'main', index: 0 }]] },
    'DuckDuckGo Search':   { main: [[{ node: 'Respond',           type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

// ── 5. Send SMS ───────────────────────────────────────────────────────────────
const sendSmsWorkflow = {
  name: 'Wingman: Send SMS',
  nodes: [
    stickyMeta({
      wingman: {
        description: 'Send an SMS text message to a phone number',
        schema: {
          to:   { type: 'string', description: 'recipient phone number in E.164 format e.g. +12125551234' },
          body: { type: 'string', description: 'SMS message text' },
        },
      },
    }),
    node('Webhook', 'n8n-nodes-base.webhook', 2, [240, 300], {
      httpMethod: 'POST',
      path: 'wingman-send-sms',
      responseMode: 'responseNode',
      options: {},
    }),
    node('Telnyx SMS', 'n8n-nodes-base.httpRequest', 4, [520, 300], {
      method: 'POST',
      url: 'https://api.telnyx.com/v2/messages',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      body: {
        mode: 'json',
        jsonBody: '={"from":"{{ $env.TELNYX_PHONE_NUMBER }}","to":"{{ $json.body.to }}","text":"{{ $json.body.body }}","messaging_profile_id":"{{ $env.TELNYX_MESSAGING_PROFILE_ID }}"}',
      },
      options: {},
    }),
    node('Respond', 'n8n-nodes-base.respondToWebhook', 1, [800, 300], {
      respondWith: 'json',
      responseBody: '={"success":true,"to":"{{ $json.body.to }}"}',
    }),
  ],
  connections: {
    Webhook:      { main: [[{ node: 'Telnyx SMS', type: 'main', index: 0 }]] },
    'Telnyx SMS': { main: [[{ node: 'Respond',    type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main setup
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOWS = [
  sendEmailWorkflow,
  getCalendarWorkflow,
  createEventWorkflow,
  webSearchWorkflow,
  sendSmsWorkflow,
];

async function run() {
  console.log('Wingman n8n Setup\n');

  // 1. Create or find the "wingman" tag
  console.log('→ Setting up "wingman" tag...');
  let wingmanTagId;
  try {
    const existing = await api('GET', '/tags');
    const found = (existing.data || []).find(t => t.name.toLowerCase() === 'wingman');
    if (found) {
      wingmanTagId = found.id;
      console.log(`  ✓ Tag already exists (id: ${wingmanTagId})`);
    } else {
      const created = await api('POST', '/tags', { name: 'wingman' });
      wingmanTagId = created.id;
      console.log(`  ✓ Tag created (id: ${wingmanTagId})`);
    }
  } catch (err) {
    console.error('  ✗ Failed to create tag:', err.message);
    process.exit(1);
  }

  // 2. Create each workflow
  const results = [];
  for (const wfDef of WORKFLOWS) {
    process.stdout.write(`→ Creating "${wfDef.name}"... `);
    try {
      // Check if already exists
      const existing = await api('GET', '/workflows');
      const alreadyExists = (existing.data || []).find(w => w.name === wfDef.name);
      if (alreadyExists) {
        console.log(`skipped (already exists)`);
        results.push({ name: wfDef.name, id: alreadyExists.id, skipped: true });
        continue;
      }

      // Create workflow
      const created = await api('POST', '/workflows', wfDef);
      const wfId = created.id;

      // Tag it (PUT replaces all tags on the workflow)
      await api('PUT', `/workflows/${wfId}/tags`, [{ id: wingmanTagId }]);

      // Activate it
      await api('POST', `/workflows/${wfId}/activate`, {});

      console.log(`✓ (id: ${wfId})`);
      results.push({ name: wfDef.name, id: wfId, skipped: false });
    } catch (err) {
      console.log(`✗ ${err.message}`);
      results.push({ name: wfDef.name, error: err.message });
    }
  }

  // 3. Summary
  console.log('\n────────────────────────────────────────');
  console.log('Setup complete!\n');

  const ok = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  console.log(`${ok.length} workflows ready:`);
  ok.forEach(r => console.log(`  ✓ ${r.name}${r.skipped ? ' (already existed)' : ''}`));

  if (failed.length) {
    console.log(`\n${failed.length} failed:`);
    failed.forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
  }

  console.log(`
⚠️  GOOGLE AUTH REQUIRED (one time):
   Send Email + Calendar workflows need your Google account.
   1. Open http://localhost:5678
   2. Open "Wingman: Send Email" → click the Gmail node → "Connect account"
   3. Open "Wingman: Get Calendar Events" → click the Google Calendar node → "Connect account"
   4. Repeat for "Wingman: Create Calendar Event"
   That's it — all future runs use the saved credentials.
`);
}

run().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});

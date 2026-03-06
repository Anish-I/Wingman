const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const API_KEY = process.env.N8N_API_KEY;

function headers() {
  if (!API_KEY) throw new Error('N8N_API_KEY not set.');
  return { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' };
}

/**
 * Parse wingman metadata from a workflow's sticky note node.
 * Expected format: JSON with { wingman: { description, schema } }
 */
function parseWingmanMeta(nodes) {
  const sticky = (nodes || []).find(n => n.type === 'n8n-nodes-base.stickyNote');
  if (!sticky) return null;
  try {
    const parsed = JSON.parse(sticky.parameters?.content || '');
    return parsed.wingman || null;
  } catch {
    return null;
  }
}

/**
 * Fetch all active n8n workflows tagged "wingman" and convert to LLM tool definitions.
 * Workflows with a Wingman sticky note get typed parameter schemas.
 * Workflows without get a generic `instructions` string parameter.
 */
async function getWorkflowTools() {
  const res = await fetch(`${N8N_BASE}/api/v1/workflows?active=true`, { headers: headers() });
  if (!res.ok) throw new Error(`n8n API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const workflows = data.data || [];

  const tools = [];

  for (const wf of workflows) {
    // Only expose workflows tagged "wingman"
    const tags = (wf.tags || []).map(t => (typeof t === 'string' ? t : t.name).toLowerCase());
    if (!tags.includes('wingman')) continue;

    // Find POST webhook trigger
    const webhookNode = (wf.nodes || []).find(n =>
      n.type === 'n8n-nodes-base.webhook' && n.parameters?.httpMethod === 'POST'
    );
    if (!webhookNode?.parameters?.path) continue;

    const webhookPath = webhookNode.parameters.path;
    const toolName = wf.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Read structured metadata from sticky note, or fall back to generic instructions
    const meta = parseWingmanMeta(wf.nodes);
    const description = meta?.description || wf.name;
    const parameters = meta?.schema
      ? {
          type: 'object',
          properties: meta.schema,
          required: Object.keys(meta.schema).filter(k => !meta.schema[k].optional),
        }
      : {
          type: 'object',
          properties: {
            instructions: {
              type: 'string',
              description: `Natural language instructions for: ${wf.name}. Include all relevant details.`,
            },
          },
          required: ['instructions'],
        };

    tools.push({
      type: 'function',
      function: { name: toolName, description, parameters },
      _webhook_path: webhookPath,
      _workflow_name: wf.name,
    });
  }

  return tools;
}

/**
 * Execute a workflow by POSTing its full input payload to the webhook.
 */
async function executeWorkflow(webhookPath, inputData, extraData = {}) {
  const url = `${N8N_BASE}/webhook/${webhookPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...inputData, ...extraData }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`n8n webhook failed ${res.status}: ${body}`);
  }

  const text = await res.text();
  try { return JSON.parse(text); } catch { return { result: text }; }
}

module.exports = { getWorkflowTools, executeWorkflow };

const { executeAction } = require('./zapier');

/**
 * Maps Claude tool names to Zapier app/action pairs.
 */
const TOOL_ACTION_MAP = {
  // Google Calendar
  'read_calendar':        { appSlug: 'google-calendar', actionSlug: 'find_events' },
  'create_event':         { appSlug: 'google-calendar', actionSlug: 'create_event' },
  'update_event':         { appSlug: 'google-calendar', actionSlug: 'update_event' },
  'delete_event':         { appSlug: 'google-calendar', actionSlug: 'delete_event' },
  'find_free_time':       { appSlug: 'google-calendar', actionSlug: 'find_events' },

  // Finance
  'get_balance':              { appSlug: 'plaid', actionSlug: 'get_account_balance' },
  'get_transactions':         { appSlug: 'plaid', actionSlug: 'get_transactions' },
  'get_spending_by_category': { appSlug: 'plaid', actionSlug: 'get_transactions' },
  'get_subscriptions':        { appSlug: 'rocket-money', actionSlug: 'get_subscriptions' },

  // Google Sheets
  'add_sheet_row': { appSlug: 'google-sheets', actionSlug: 'create_spreadsheet_row' },
  'read_sheet':    { appSlug: 'google-sheets', actionSlug: 'lookup_spreadsheet_row' },
  'create_sheet':  { appSlug: 'google-sheets', actionSlug: 'create_spreadsheet' },

  // Task management
  'create_task':      { appSlug: 'todoist', actionSlug: 'create_task' },
  'get_tasks':        { appSlug: 'todoist', actionSlug: 'find_task' },
  'complete_task':    { appSlug: 'todoist', actionSlug: 'complete_task' },
  'get_overdue_tasks': { appSlug: 'todoist', actionSlug: 'find_task' },

  // Notion
  'send_notion_entry': { appSlug: 'notion', actionSlug: 'create_database_item' },

  // Smart home
  'control_device': { appSlug: 'philips-hue', actionSlug: 'set_light_state' },
};

/**
 * Transform Claude tool input into the Zapier action input format.
 * Each tool may need field mapping since Claude uses descriptive names
 * while Zapier uses API-specific field names.
 */
function transformInput(toolName, toolInput) {
  switch (toolName) {
    case 'read_calendar':
    case 'find_free_time':
      return {
        start_time: toolInput.start_date || toolInput.start,
        end_time: toolInput.end_date || toolInput.end,
        calendar_id: toolInput.calendar_id || 'primary',
        query: toolInput.query || '',
      };

    case 'create_event':
      return {
        summary: toolInput.title || toolInput.summary,
        start_time: toolInput.start_time || toolInput.start,
        end_time: toolInput.end_time || toolInput.end,
        description: toolInput.description || '',
        location: toolInput.location || '',
        calendar_id: toolInput.calendar_id || 'primary',
        attendees: toolInput.attendees ? toolInput.attendees.join(',') : '',
      };

    case 'update_event':
      return {
        event_id: toolInput.event_id,
        summary: toolInput.title || toolInput.summary,
        start_time: toolInput.start_time || toolInput.start,
        end_time: toolInput.end_time || toolInput.end,
        description: toolInput.description,
        location: toolInput.location,
      };

    case 'delete_event':
      return {
        event_id: toolInput.event_id,
        calendar_id: toolInput.calendar_id || 'primary',
      };

    case 'get_balance':
      return {
        account_id: toolInput.account_id,
      };

    case 'get_transactions':
      return {
        start_date: toolInput.start_date,
        end_date: toolInput.end_date,
        account_id: toolInput.account_id,
        count: toolInput.limit || 50,
      };

    case 'get_spending_by_category':
      return {
        start_date: toolInput.start_date,
        end_date: toolInput.end_date,
        account_id: toolInput.account_id,
        count: 500, // fetch more to aggregate
      };

    case 'get_subscriptions':
      return {};

    case 'add_sheet_row':
      return {
        spreadsheet_id: toolInput.spreadsheet_id,
        worksheet: toolInput.sheet_name || 'Sheet1',
        data: toolInput.row_data || toolInput.data,
      };

    case 'read_sheet':
      return {
        spreadsheet_id: toolInput.spreadsheet_id,
        worksheet: toolInput.sheet_name || 'Sheet1',
        lookup_column: toolInput.column,
        lookup_value: toolInput.value,
      };

    case 'create_sheet':
      return {
        title: toolInput.title,
        headers: toolInput.headers,
      };

    case 'create_task':
      return {
        content: toolInput.title || toolInput.content,
        description: toolInput.description || '',
        due_date: toolInput.due_date || toolInput.due,
        priority: toolInput.priority || 1,
        project_id: toolInput.project_id,
      };

    case 'get_tasks':
      return {
        project_id: toolInput.project_id,
        filter: toolInput.filter || 'all',
      };

    case 'complete_task':
      return {
        task_id: toolInput.task_id,
      };

    case 'get_overdue_tasks':
      return {
        filter: 'overdue',
      };

    case 'send_notion_entry':
      return {
        database_id: toolInput.database_id,
        properties: toolInput.properties || toolInput.data,
      };

    case 'control_device':
      return {
        light_id: toolInput.device_id || toolInput.light_id,
        on: toolInput.state === 'on',
        brightness: toolInput.brightness,
        color: toolInput.color,
      };

    default:
      // Pass through unchanged for unknown tools
      return toolInput;
  }
}

/**
 * Transform Zapier response into a clean format for Claude to present to the user.
 */
function transformOutput(toolName, zapierResult) {
  if (!zapierResult) {
    return { success: true, message: 'Action completed.' };
  }

  switch (toolName) {
    case 'read_calendar':
    case 'find_free_time': {
      const events = Array.isArray(zapierResult) ? zapierResult : zapierResult.events || [zapierResult];
      return {
        events: events.map((e) => ({
          id: e.id,
          title: e.summary || e.title,
          start: e.start_time || e.start,
          end: e.end_time || e.end,
          location: e.location || null,
        })),
      };
    }

    case 'create_event':
    case 'update_event':
      return {
        success: true,
        event_id: zapierResult.id,
        title: zapierResult.summary || zapierResult.title,
        start: zapierResult.start_time || zapierResult.start,
        end: zapierResult.end_time || zapierResult.end,
      };

    case 'delete_event':
      return { success: true, message: 'Event deleted.' };

    case 'get_balance':
      return {
        accounts: Array.isArray(zapierResult) ? zapierResult : [zapierResult],
      };

    case 'get_transactions':
      return {
        transactions: (Array.isArray(zapierResult) ? zapierResult : zapierResult.transactions || []).map((t) => ({
          date: t.date,
          name: t.name || t.merchant_name,
          amount: t.amount,
          category: t.category ? t.category[0] : null,
        })),
      };

    case 'get_spending_by_category': {
      const txns = Array.isArray(zapierResult) ? zapierResult : zapierResult.transactions || [];
      const byCategory = {};
      for (const t of txns) {
        const cat = t.category ? t.category[0] : 'Other';
        byCategory[cat] = (byCategory[cat] || 0) + Math.abs(t.amount || 0);
      }
      return { spending_by_category: byCategory };
    }

    case 'get_subscriptions':
      return {
        subscriptions: (Array.isArray(zapierResult) ? zapierResult : []).map((s) => ({
          name: s.name || s.title,
          amount: s.amount || s.price,
          frequency: s.frequency || s.billing_cycle,
        })),
      };

    case 'get_tasks':
    case 'get_overdue_tasks': {
      const tasks = Array.isArray(zapierResult) ? zapierResult : [zapierResult];
      return {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.content || t.title,
          due: t.due_date || (t.due && t.due.date) || null,
          priority: t.priority,
          completed: t.is_completed || false,
        })),
      };
    }

    case 'create_task':
      return {
        success: true,
        task_id: zapierResult.id,
        title: zapierResult.content || zapierResult.title,
      };

    case 'complete_task':
      return { success: true, message: 'Task completed.' };

    case 'add_sheet_row':
      return { success: true, message: 'Row added to spreadsheet.' };

    case 'read_sheet':
      return { rows: Array.isArray(zapierResult) ? zapierResult : [zapierResult] };

    case 'create_sheet':
      return {
        success: true,
        spreadsheet_id: zapierResult.id || zapierResult.spreadsheet_id,
        title: zapierResult.title,
      };

    case 'send_notion_entry':
      return {
        success: true,
        page_id: zapierResult.id,
        url: zapierResult.url,
      };

    case 'control_device':
      return { success: true, message: 'Device updated.' };

    default:
      return zapierResult;
  }
}

/**
 * Main dispatcher: execute a Claude tool call via Zapier.
 * @param {string} toolName - Claude tool name (e.g. 'create_event')
 * @param {object} toolInput - Claude tool input object
 * @param {string} zapierAccountId - user's Zapier account ID
 * @returns {object} formatted result for Claude to present
 */
async function executeToolCall(toolName, toolInput, zapierAccountId) {
  const mapping = TOOL_ACTION_MAP[toolName];
  if (!mapping) {
    throw new Error(`Unknown tool: ${toolName}. No Zapier mapping found.`);
  }

  const { appSlug, actionSlug } = mapping;
  const zapierInput = transformInput(toolName, toolInput);

  const rawResult = await executeAction(zapierAccountId, appSlug, actionSlug, zapierInput);
  return transformOutput(toolName, rawResult);
}

module.exports = {
  TOOL_ACTION_MAP,
  executeToolCall,
  transformInput,
  transformOutput,
};

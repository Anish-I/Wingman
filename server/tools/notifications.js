const NOTIFICATION_TOOLS = [
  {
    name: 'send_notion_entry',
    description: 'Create an entry in a Notion database with a title, content, and optional tags.',
    input_schema: {
      type: 'object',
      properties: {
        database: {
          type: 'string',
          description: 'Optional Notion database name. Uses default if not specified.',
        },
        title: {
          type: 'string',
          description: 'Entry title',
        },
        content: {
          type: 'string',
          description: 'Entry content or body text',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags to categorize the entry',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'control_device',
    description: 'Control a smart home device — turn on, turn off, or set a value.',
    input_schema: {
      type: 'object',
      properties: {
        device_name: {
          type: 'string',
          description: 'Name of the device to control (e.g. "living room lights")',
        },
        action: {
          type: 'string',
          enum: ['on', 'off', 'set'],
          description: 'Action to perform on the device',
        },
        value: {
          type: 'string',
          description: 'Optional value for "set" action (e.g. "72" for thermostat, "50%" for brightness)',
        },
      },
      required: ['device_name', 'action'],
    },
  },
];

module.exports = { NOTIFICATION_TOOLS };

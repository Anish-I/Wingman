const SHEETS_TOOLS = [
  {
    name: 'add_sheet_row',
    description: 'Add a new row to a spreadsheet or database table.',
    input_schema: {
      type: 'object',
      properties: {
        sheet_name: {
          type: 'string',
          description: 'Name of the sheet or table to add data to',
        },
        data: {
          type: 'object',
          description: 'Key-value pairs of column names to values',
        },
      },
      required: ['sheet_name', 'data'],
    },
  },
  {
    name: 'read_sheet',
    description: 'Read data from a spreadsheet or database table, with optional text query and row limit.',
    input_schema: {
      type: 'object',
      properties: {
        sheet_name: {
          type: 'string',
          description: 'Name of the sheet or table to read from',
        },
        query: {
          type: 'string',
          description: 'Optional text filter/search query',
        },
        limit: {
          type: 'number',
          description: 'Max number of rows to return (default 10)',
        },
      },
      required: ['sheet_name'],
    },
  },
  {
    name: 'create_sheet',
    description: 'Create a new spreadsheet or database table with specified columns.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new sheet or table',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of column names',
        },
      },
      required: ['name', 'columns'],
    },
  },
  {
    name: 'get_sheet_summary',
    description: 'Get a summary of a spreadsheet including row count, columns, and sample data.',
    input_schema: {
      type: 'object',
      properties: {
        sheet_name: {
          type: 'string',
          description: 'Name of the sheet or table to summarize',
        },
      },
      required: ['sheet_name'],
    },
  },
];

module.exports = { SHEETS_TOOLS };

const FINANCE_TOOLS = [
  {
    name: 'get_balance',
    description: 'Get current account balance(s). Can filter by account type.',
    input_schema: {
      type: 'object',
      properties: {
        account_type: {
          type: 'string',
          enum: ['checking', 'savings', 'all'],
          description: 'Which account balance to retrieve. Defaults to all.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_transactions',
    description: 'Get recent transactions, optionally filtered by category.',
    input_schema: {
      type: 'object',
      properties: {
        days_back: {
          type: 'number',
          description: 'Number of days back to look for transactions',
        },
        category: {
          type: 'string',
          description: 'Optional category filter (e.g. "food", "transport", "entertainment")',
        },
      },
      required: ['days_back'],
    },
  },
  {
    name: 'get_spending_by_category',
    description: 'Get a spending breakdown by category for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_subscriptions',
    description: 'Get a list of detected recurring charges and subscriptions.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

module.exports = { FINANCE_TOOLS };

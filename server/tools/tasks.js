const TASKS_TOOLS = [
  {
    name: 'create_task',
    description: 'Create a new task or to-do item with optional due date, priority, and project.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title or description',
        },
        due_date: {
          type: 'string',
          description: 'Optional due date in YYYY-MM-DD format',
        },
        priority: {
          type: 'number',
          enum: [1, 2, 3, 4],
          description: 'Priority level: 1 (urgent) to 4 (low). Default is 4.',
        },
        project: {
          type: 'string',
          description: 'Optional project name to file the task under',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_tasks',
    description: 'Get tasks with optional filter by time range or project.',
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['today', 'overdue', 'this_week', 'all'],
          description: 'Filter tasks by time range. Default is "today".',
        },
        project: {
          type: 'string',
          description: 'Optional project name to filter by',
        },
      },
      required: [],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The ID of the task to complete',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'get_overdue_tasks',
    description: 'Get all tasks that are past their due date and not yet completed.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

module.exports = { TASKS_TOOLS };

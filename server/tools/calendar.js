const CALENDAR_TOOLS = [
  {
    name: 'read_calendar',
    description: 'Read calendar events within a date range. Returns a list of upcoming events with titles, times, and locations.',
    input_schema: {
      type: 'object',
      properties: {
        date_range: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              description: 'Start date/time in ISO 8601 format (e.g. 2025-01-15T00:00:00)',
            },
            end: {
              type: 'string',
              description: 'End date/time in ISO 8601 format (e.g. 2025-01-15T23:59:59)',
            },
          },
          required: ['start', 'end'],
        },
      },
      required: ['date_range'],
    },
  },
  {
    name: 'create_event',
    description: 'Create a new calendar event with a title, start/end time, and optional description and location.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title',
        },
        start_time: {
          type: 'string',
          description: 'Event start time in ISO 8601 format',
        },
        end_time: {
          type: 'string',
          description: 'Event end time in ISO 8601 format',
        },
        description: {
          type: 'string',
          description: 'Optional event description',
        },
        location: {
          type: 'string',
          description: 'Optional event location',
        },
      },
      required: ['title', 'start_time', 'end_time'],
    },
  },
  {
    name: 'update_event',
    description: 'Update an existing calendar event. Provide the event ID and fields to change.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'The ID of the event to update',
        },
        updates: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'New event title' },
            start_time: { type: 'string', description: 'New start time in ISO 8601' },
            end_time: { type: 'string', description: 'New end time in ISO 8601' },
          },
        },
      },
      required: ['event_id', 'updates'],
    },
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'The ID of the event to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['event_id', 'confirm'],
    },
  },
  {
    name: 'find_free_time',
    description: 'Find available time slots on a given date for a specified duration.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date to search for free time (YYYY-MM-DD)',
        },
        duration_minutes: {
          type: 'number',
          description: 'Desired free block duration in minutes',
        },
      },
      required: ['date', 'duration_minutes'],
    },
  },
];

module.exports = { CALENDAR_TOOLS };

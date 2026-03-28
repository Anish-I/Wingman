import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const inboundMessageStatusEnum = pgEnum('wm_inbound_message_status', [
  'received',
  'queued',
  'processing',
  'completed',
  'failed'
]);

export const connectionStatusEnum = pgEnum('wm_connection_status', [
  'connected',
  'disconnected',
  'errored'
]);

export const automationStatusEnum = pgEnum('wm_automation_status', [
  'active',
  'paused',
  'errored'
]);

export const users = pgTable('wm_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).notNull().default('America/New_York'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  phoneUnique: uniqueIndex('wm_users_phone_unique').on(table.phone)
}));

export const inboundMessages = pgTable('wm_inbound_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  telnyxEventId: text('telnyx_event_id').notNull(),
  fromPhone: varchar('from_phone', { length: 20 }).notNull(),
  body: text('body').notNull(),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
  status: inboundMessageStatusEnum('status').notNull().default('received'),
  agentDecision: jsonb('agent_decision').$type<Record<string, unknown> | null>(),
  replyText: text('reply_text'),
  errorText: text('error_text'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true })
}, (table) => ({
  eventIdUnique: uniqueIndex('wm_inbound_messages_event_unique').on(table.telnyxEventId)
}));

export const appConnections = pgTable('wm_app_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  appSlug: text('app_slug').notNull(),
  composioSessionId: text('composio_session_id').notNull(),
  composioAccountId: text('composio_account_id'),
  status: connectionStatusEnum('status').notNull().default('connected'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userAppUnique: uniqueIndex('wm_app_connections_user_app_unique').on(table.userId, table.appSlug)
}));

export const automations = pgTable('wm_automations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  objective: text('objective').notNull(),
  cronExpression: text('cron_expression').notNull(),
  appSlug: text('app_slug').notNull(),
  toolSlug: text('tool_slug').notNull(),
  toolInputTemplate: jsonb('tool_input_template').$type<Record<string, unknown>>().notNull().default({}),
  status: automationStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const automationRuns = pgTable('wm_automation_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  automationId: uuid('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  result: jsonb('result').$type<Record<string, unknown> | null>(),
  errorText: text('error_text'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true })
});


import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appConnections, inboundMessages, users } from '../db/schema.js';
import type { BossService } from '../jobs/boss.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { AutomationService } from './automations.js';
import type { ComposioService } from './composio.js';
import type { ConversationTurn, OpenAIAgentService } from './openai-agent.js';
import type { ParsedInboundMessage, TelnyxService } from './telnyx.js';

const HISTORY_WINDOW = 6;

type MessageProcessorDeps = {
  automations: AutomationService;
  boss: BossService;
  composio: ComposioService;
  openaiAgent: OpenAIAgentService;
  telnyx: TelnyxService;
};

export class MessageProcessor {
  private readonly automations: AutomationService;
  private readonly boss: BossService;
  private readonly composio: ComposioService;
  private readonly openaiAgent: OpenAIAgentService;
  private readonly telnyx: TelnyxService;

  constructor(deps: MessageProcessorDeps) {
    this.automations = deps.automations;
    this.boss = deps.boss;
    this.composio = deps.composio;
    this.openaiAgent = deps.openaiAgent;
    this.telnyx = deps.telnyx;
  }

  async recordAndQueueInboundMessage(message: ParsedInboundMessage) {
    const user = await this.findOrCreateUserByPhone(message.fromPhone);

    const inserted = await db.insert(inboundMessages).values({
      userId: user.id,
      telnyxEventId: message.eventId,
      fromPhone: message.fromPhone,
      body: message.text,
      rawPayload: message.rawPayload,
      status: 'queued'
    }).onConflictDoNothing().returning({
      id: inboundMessages.id
    });

    const inboundMessage = inserted[0];
    if (!inboundMessage) {
      return { duplicate: true };
    }

    await this.boss.enqueueInboundMessage(inboundMessage.id);
    return { duplicate: false, inboundMessageId: inboundMessage.id };
  }

  async processQueuedInboundMessage(inboundMessageId: string) {
    const [row] = await db.select({
      id: inboundMessages.id,
      status: inboundMessages.status,
      fromPhone: inboundMessages.fromPhone,
      body: inboundMessages.body,
      userId: users.id
    })
      .from(inboundMessages)
      .innerJoin(users, eq(inboundMessages.userId, users.id))
      .where(eq(inboundMessages.id, inboundMessageId))
      .limit(1);

    if (!row) {
      logger.warn({ inboundMessageId }, 'Inbound message disappeared before processing');
      return;
    }

    if (row.status === 'completed') {
      return;
    }

    await db.update(inboundMessages)
      .set({ status: 'processing' })
      .where(eq(inboundMessages.id, inboundMessageId));

    try {
      const connections = await db.select({
        appSlug: appConnections.appSlug,
        sessionId: appConnections.composioSessionId,
        accountId: appConnections.composioAccountId
      })
        .from(appConnections)
        .where(and(
          eq(appConnections.userId, row.userId),
          eq(appConnections.status, 'connected')
        ));

      const connectedApps = connections.map((connection) => connection.appSlug);
      const recentHistory = await this.getRecentHistory(row.userId);
      const decision = await this.openaiAgent.decideNextStep({
        message: row.body,
        phone: row.fromPhone,
        connectedApps,
        recentHistory
      });

      let replyText: string;

      switch (decision.kind) {
        case 'reply':
          replyText = decision.reply;
          break;
        case 'clarify':
          replyText = decision.question;
          break;
        case 'execute': {
          const connection = connections.find((item) => item.appSlug === decision.appSlug);
          if (!connection) {
            replyText = `I need you to connect ${decision.appSlug} before I can do that.`;
            break;
          }

          const result = await this.composio.executeTool({
            sessionId: connection.sessionId,
            accountId: connection.accountId,
            toolSlug: decision.toolSlug,
            input: decision.input
          });

          replyText = await this.openaiAgent.summarizeToolResult(decision.toolSlug, result);
          break;
        }
        case 'schedule': {
          const connection = connections.find((item) => item.appSlug === decision.automation.appSlug);
          if (!connection) {
            replyText = `I need you to connect ${decision.automation.appSlug} before I can schedule that.`;
            break;
          }

          await this.automations.create({
            userId: row.userId,
            name: decision.automation.name,
            objective: row.body,
            cronExpression: decision.automation.cron,
            appSlug: decision.automation.appSlug,
            toolSlug: decision.automation.toolSlug,
            toolInputTemplate: decision.automation.input
          });

          replyText = decision.reply;
          break;
        }
      }

      await this.telnyx.sendMessage(row.fromPhone, replyText);

      await db.update(inboundMessages)
        .set({
          status: 'completed',
          agentDecision: decision,
          replyText,
          processedAt: new Date()
        })
        .where(eq(inboundMessages.id, inboundMessageId));
    } catch (error) {
      logger.error({ error, inboundMessageId }, 'Inbound message processing failed');

      await db.update(inboundMessages)
        .set({
          status: 'failed',
          errorText: error instanceof Error ? error.message : 'Unknown error',
          processedAt: new Date()
        })
        .where(eq(inboundMessages.id, inboundMessageId));

      try {
        await this.telnyx.sendMessage(
          row.fromPhone,
          'I hit a problem while handling that request. Please try again.'
        );
      } catch (sendError) {
        logger.error({ sendError, inboundMessageId }, 'Failed to send fallback SMS');
      }
    }
  }

  private async getRecentHistory(userId: string): Promise<ConversationTurn[]> {
    const recent = await db.select({
      body: inboundMessages.body,
      replyText: inboundMessages.replyText
    })
      .from(inboundMessages)
      .where(and(
        eq(inboundMessages.userId, userId),
        eq(inboundMessages.status, 'completed')
      ))
      .orderBy(desc(inboundMessages.receivedAt))
      .limit(HISTORY_WINDOW);

    const turns: ConversationTurn[] = [];
    for (const row of recent.reverse()) {
      turns.push({ role: 'user', text: row.body });
      if (row.replyText) {
        turns.push({ role: 'assistant', text: row.replyText });
      }
    }
    return turns;
  }

  private async findOrCreateUserByPhone(phone: string) {
    const inserted = await db.insert(users).values({
      phone
    }).onConflictDoNothing().returning();

    if (inserted[0]) {
      return inserted[0];
    }

    const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!existing) {
      throw new AppError(500, 'USER_LOOKUP_FAILED', 'Failed to resolve user for phone.');
    }

    return existing;
  }
}

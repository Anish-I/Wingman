import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { automations, users } from '../db/schema.js';

type CreateAutomationInput = {
  userId: string;
  name: string;
  objective: string;
  cronExpression: string;
  appSlug: string;
  toolSlug: string;
  toolInputTemplate: Record<string, unknown>;
};

export class AutomationService {
  async create(input: CreateAutomationInput) {
    const [automation] = await db.insert(automations).values({
      userId: input.userId,
      name: input.name,
      objective: input.objective,
      cronExpression: input.cronExpression,
      appSlug: input.appSlug,
      toolSlug: input.toolSlug,
      toolInputTemplate: input.toolInputTemplate
    }).returning();

    return automation;
  }

  async listForPhone(phone: string) {
    return db.select({
      id: automations.id,
      name: automations.name,
      objective: automations.objective,
      cronExpression: automations.cronExpression,
      appSlug: automations.appSlug,
      toolSlug: automations.toolSlug,
      status: automations.status,
      createdAt: automations.createdAt
    })
      .from(automations)
      .innerJoin(users, eq(automations.userId, users.id))
      .where(eq(users.phone, phone));
  }
}

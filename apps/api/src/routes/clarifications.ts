import type { FastifyInstance } from 'fastify';
import { COST_CODE_MAP, createClarificationSchema } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { writeAuditLog } from '../security/audit.js';

export async function registerClarificationRoutes(app: FastifyInstance) {
  app.get('/api/clarifications', { schema: { tags: ['Clarifications'] } }, async () => ({
    clarifications: demoStore.clarifications,
  }));

  app.post('/api/clarifications', { schema: { tags: ['Clarifications'] } }, async (request, reply) => {
    const parsed = createClarificationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const home = demoStore.homes.find((h) => h.id === d.homeId);
    const cc = COST_CODE_MAP.get(d.costCode);
    if (!home || !cc) return reply.status(404).send({ error: 'HomeOrCostCodeNotFound' });

    const newItem = {
      id: `clr-${Date.now().toString(36)}`,
      homeId: home.id,
      homeCode: home.homeCode,
      costCode: d.costCode,
      costCodeName: cc.name,
      category: d.category,
      title: d.title,
      status: 'open' as const,
      ownerName: request.actor.fullName,
      dueDate: d.dueDate ?? new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
      messages: [
        {
          author: request.actor.fullName,
          body: d.description,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    demoStore.clarifications.unshift(newItem);
    await writeAuditLog({
      actorUserId: request.actor.userId,
      actorEmail: request.actor.email,
      action: 'CLARIFICATION_CREATED',
      entityType: 'clarification',
      entityId: newItem.id,
      homeId: home.id,
      ipAddress: request.ip,
      afterValues: { costCode: d.costCode, category: d.category, title: d.title },
    });

    return reply.status(201).send({ clarification: newItem });
  });
}

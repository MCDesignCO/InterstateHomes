import type { FastifyInstance } from 'fastify';
import { quoteCounterSchema, quoteDecisionSchema } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { requirePermission } from '../security/auth-plugin.js';
import { writeAuditLog } from '../security/audit.js';

export async function registerQuoteRoutes(app: FastifyInstance) {
  app.get('/api/quotes', { schema: { tags: ['Quotes'] } }, async (request) => {
    const quotes =
      request.actor.role === 'subcontractor' && request.actor.subCompanyId
        ? demoStore.quotes.filter((q) => q.subCompanyId === request.actor.subCompanyId)
        : demoStore.quotes;
    return { quotes };
  });

  app.post(
    '/api/quotes/:id/counter',
    { schema: { tags: ['Quotes'], summary: 'Subcontractor adjusts quote price or quantity (Rule 3)' } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = quoteCounterSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }
      const quote = demoStore.quotes.find((q) => q.id === id);
      if (!quote) return reply.status(404).send({ error: 'QuoteNotFound' });

      if (
        request.actor.role === 'subcontractor' &&
        quote.subCompanyId !== request.actor.subCompanyId
      ) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const prevTotal = quote.quotedTotalCents;
      quote.status = 'sub_adjusted';
      quote.rounds.push({
        roundNumber: quote.rounds.length + 1,
        actorType: 'subcontractor',
        proposedTotalCents: parsed.data.proposedTotalCents,
        proposedQuantity: parsed.data.proposedQuantity,
        comment: parsed.data.comment,
        createdAt: new Date().toISOString(),
      });

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'QUOTE_COUNTER_SUBMITTED',
        entityType: 'quote',
        entityId: quote.id,
        homeId: quote.homeId,
        ipAddress: request.ip,
        beforeValues: { quotedTotalCents: prevTotal },
        afterValues: {
          proposedTotalCents: parsed.data.proposedTotalCents,
          proposedQuantity: parsed.data.proposedQuantity,
        },
      });

      return { quote };
    }
  );

  app.post(
    '/api/quotes/:id/decision',
    {
      preHandler: [requirePermission('quotes:decide')],
      schema: { tags: ['Quotes'], summary: 'Estimator accepts, rejects, or renegotiates a quote' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = quoteDecisionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }
      const quote = demoStore.quotes.find((q) => q.id === id);
      if (!quote) return reply.status(404).send({ error: 'QuoteNotFound' });

      const prevStatus = quote.status;
      if (parsed.data.decision === 'accept') {
        const latest = quote.rounds[quote.rounds.length - 1];
        quote.quotedTotalCents = latest?.proposedTotalCents ?? quote.quotedTotalCents;
        quote.status = 'accepted';
      } else if (parsed.data.decision === 'reject') {
        quote.status = 'rejected';
      } else {
        quote.status = 'sent';
        quote.rounds.push({
          roundNumber: quote.rounds.length + 1,
          actorType: 'estimator',
          proposedTotalCents: quote.quotedTotalCents,
          comment: parsed.data.note ?? 'Returned to subcontractor for renegotiation.',
          createdAt: new Date().toISOString(),
        });
      }

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'QUOTE_DECISION',
        entityType: 'quote',
        entityId: quote.id,
        homeId: quote.homeId,
        ipAddress: request.ip,
        beforeValues: { status: prevStatus },
        afterValues: { status: quote.status, decision: parsed.data.decision },
      });

      return { quote };
    }
  );
}

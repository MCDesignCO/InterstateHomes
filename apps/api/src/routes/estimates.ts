import type { FastifyInstance } from 'fastify';
import {
  INTERNAL_ONLY_COST_CODES,
  canAccess,
  projectHomeownerEstimate,
  updateEstimateLineSchema,
} from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { requirePermission } from '../security/auth-plugin.js';
import { writeAuditLog } from '../security/audit.js';

export async function registerEstimateRoutes(app: FastifyInstance) {
  app.get('/api/homes/:homeId/estimate', { schema: { tags: ['Estimates'] } }, async (request, reply) => {
    const { homeId } = request.params as { homeId: string };
    const home = demoStore.homes.find((h) => h.id === homeId);
    const est = demoStore.estimates.get(homeId);
    if (!home || !est) return reply.status(404).send({ error: 'EstimateNotFound' });

    const canSeeInternal = canAccess(request.actor.role, 'financials:view_internal');
    const lines = est.lines.filter(
      (l) => canSeeInternal || !INTERNAL_ONLY_COST_CODES.has(l.costCode)
    );
    const totalEstimatedCents = lines.reduce((sum, l) => sum + l.extendedCents, 0);

    return {
      home: {
        ...home,
        soldAmountCents: canSeeInternal ? home.soldAmountCents : null,
      },
      estimate: {
        id: est.id,
        homeId: est.homeId,
        versionNumber: est.versionNumber,
        status: est.status,
        totalEstimatedCents,
        lines,
      },
    };
  });

  app.get(
    '/api/homes/:homeId/estimate/homeowner',
    {
      preHandler: [requirePermission('estimates:export_homeowner')],
      schema: {
        tags: ['Estimates'],
        summary: 'Homeowner-safe estimate projection (Rule 10: strips internal codes, vendors, unit costs, margin)',
      },
    },
    async (request, reply) => {
      const { homeId } = request.params as { homeId: string };
      const home = demoStore.homes.find((h) => h.id === homeId);
      const est = demoStore.estimates.get(homeId);
      if (!home || !est) return reply.status(404).send({ error: 'EstimateNotFound' });

      const projection = projectHomeownerEstimate({
        homeCode: home.homeCode,
        planName: home.planName,
        subdivisionName: home.subdivisionName,
        lines: est.lines,
      });

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'HOMEOWNER_ESTIMATE_EXPORTED',
        entityType: 'estimate',
        entityId: est.id,
        homeId,
        ipAddress: request.ip,
      });

      return { projection };
    }
  );

  app.patch(
    '/api/estimates/:homeId/lines/:costCode',
    {
      preHandler: [requirePermission('estimates:build')],
      schema: { tags: ['Estimates'] },
    },
    async (request, reply) => {
      const { homeId, costCode } = request.params as { homeId: string; costCode: string };
      const parsed = updateEstimateLineSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }
      const est = demoStore.estimates.get(homeId);
      if (!est) return reply.status(404).send({ error: 'EstimateNotFound' });

      const line = est.lines.find((l) => l.costCode === costCode);
      if (!line) return reply.status(404).send({ error: 'CostCodeLineNotFound' });

      const before = { ...line };
      const d = parsed.data;
      if (d.quantity !== undefined) line.quantity = d.quantity;
      if (d.unit !== undefined) line.unit = d.unit;
      if (d.pricingSource !== undefined) line.pricingSource = d.pricingSource;
      if (d.selectedSubId !== undefined) {
        line.selectedSubId = d.selectedSubId;
        const sub = demoStore.subcontractors.find((s) => s.id === d.selectedSubId);
        line.selectedSubName = sub?.legalName ?? null;
      }
      if (d.unitPriceCents !== undefined) line.unitPriceCents = d.unitPriceCents;
      if (d.fixedAmountCents !== undefined) {
        line.quantity = 1;
        line.unitPriceCents = d.fixedAmountCents;
      }
      if (d.isAllowanceOrFixed !== undefined) line.isAllowanceOrFixed = d.isAllowanceOrFixed;
      if (d.showOnHomeownerPdf !== undefined) line.showOnHomeownerPdf = d.showOnHomeownerPdf;
      if (d.notes !== undefined) line.notes = d.notes;

      line.extendedCents = Math.round(line.quantity * line.unitPriceCents);

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'ESTIMATE_LINE_UPDATED',
        entityType: 'estimate_line',
        entityId: `${homeId}:${costCode}`,
        homeId,
        ipAddress: request.ip,
        beforeValues: { extendedCents: before.extendedCents, selectedSubId: before.selectedSubId },
        afterValues: { extendedCents: line.extendedCents, selectedSubId: line.selectedSubId },
      });

      return { line };
    }
  );
}

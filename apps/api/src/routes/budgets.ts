import type { FastifyInstance } from 'fastify';
import { calculateFinalBudget } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { requirePermission, requireRecentReauth } from '../security/auth-plugin.js';
import { writeAuditLog } from '../security/audit.js';

export async function registerBudgetRoutes(app: FastifyInstance) {
  app.get('/api/budgets', { schema: { tags: ['Budgets'] } }, async () => {
    const summaries = demoStore.homes.map((home) => {
      const est = demoStore.estimates.get(home.id);
      const pos = demoStore.purchaseOrders.filter((p) => p.homeId === home.id);
      const fixed = demoStore.fixedBudgetEntries.filter((f) => f.homeId === home.id);
      const calc = calculateFinalBudget(
        (est?.lines ?? []).map((l) => ({
          costCode: l.costCode,
          costCodeName: l.costCodeName,
          pricingSource: l.pricingSource,
          estimatedAmountCents: l.extendedCents,
          isAllowanceOrFixed: l.isAllowanceOrFixed,
        })),
        pos.map((p) => ({ costCode: p.costCode, totalCents: p.totalCents, status: p.status })),
        fixed.map((f) => ({ costCode: f.costCode, amountCents: f.amountCents }))
      );

      return {
        homeId: home.id,
        homeCode: home.homeCode,
        planName: home.planName,
        stage: home.stage,
        estimateVersion: est?.versionNumber ?? 1,
        ...calc,
      };
    });

    return {
      budgets: summaries,
      liveJobCostRows: demoStore.jobCostBudgets,
    };
  });

  app.post(
    '/api/budgets/:homeId/approve',
    {
      preHandler: [requirePermission('budgets:approve'), requireRecentReauth(15)],
      schema: {
        tags: ['Budgets'],
        summary: 'Approve final budget and write live rows to job_cost_budgets (Rules 7, 8, 11)',
      },
    },
    async (request, reply) => {
      const { homeId } = request.params as { homeId: string };
      const home = demoStore.homes.find((h) => h.id === homeId);
      const est = demoStore.estimates.get(homeId);
      if (!home || !est) return reply.status(404).send({ error: 'HomeOrEstimateNotFound' });

      const pos = demoStore.purchaseOrders.filter((p) => p.homeId === home.id);
      const fixed = demoStore.fixedBudgetEntries.filter((f) => f.homeId === home.id);
      const calc = calculateFinalBudget(
        est.lines.map((l) => ({
          costCode: l.costCode,
          costCodeName: l.costCodeName,
          pricingSource: l.pricingSource,
          estimatedAmountCents: l.extendedCents,
          isAllowanceOrFixed: l.isAllowanceOrFixed,
        })),
        pos.map((p) => ({ costCode: p.costCode, totalCents: p.totalCents, status: p.status })),
        fixed.map((f) => ({ costCode: f.costCode, amountCents: f.amountCents }))
      );

      if (!calc.canApprove) {
        return reply.status(422).send({
          error: 'UnsignedPurchaseOrders',
          message: 'Cannot approve budget while priced lines lack a fully signed PO.',
          blockingCostCodes: calc.blockingCostCodes,
        });
      }

      // Replace existing live job cost rows for this home (Section 5.9 & Rule 11)
      demoStore.jobCostBudgets = demoStore.jobCostBudgets.filter((r) => r.homeId !== home.id);
      const loadedAt = new Date().toISOString();
      const newRows = calc.lines
        .filter((l) => l.finalBudgetCents > 0)
        .map((l) => ({
          homeId: home.id,
          homeCode: home.homeCode,
          costCode: l.costCode,
          costCodeName: l.costCodeName,
          budgetCents: l.finalBudgetCents,
          source: `Estimating system v${est.versionNumber}`,
          loadedAt,
          estimateVersion: est.versionNumber,
        }));

      demoStore.jobCostBudgets.push(...newRows);
      home.stage = 'live_budget';

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'BUDGET_APPROVED_LIVE',
        entityType: 'job_cost_budget',
        entityId: home.homeCode,
        homeId: home.id,
        ipAddress: request.ip,
        afterValues: {
          rowsWritten: newRows.length,
          totalFinalBudgetCents: calc.totalFinalBudgetCents,
        },
      });

      return { ok: true, rowsWritten: newRows.length, liveRows: newRows };
    }
  );
}

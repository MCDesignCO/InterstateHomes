import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import {
  DEFAULT_SYSTEM_SETTINGS,
  updateSystemSettingsSchema,
  type SystemSettingsConfig,
} from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { getDb } from '../db/client.js';
import {
  auditLogs,
  dimHomes,
  dimSubcontractors,
  estimateLines,
  estimates,
  factBudgets,
  factEstimates,
  factPurchaseOrders,
  factQuotes,
  homes,
  jobCostBudgets,
  purchaseOrders,
  quotes,
  subCompanies,
  systemSettings,
  users,
  warehouseRefreshRuns,
} from '../db/schema/index.js';
import { isUsingDemoStore, requirePermission } from '../security/auth-plugin.js';
import { writeAuditLog } from '../security/audit.js';

function mapSettingsRow(row: typeof systemSettings.$inferSelect | undefined): SystemSettingsConfig {
  if (!row) return { ...DEFAULT_SYSTEM_SETTINGS };
  return {
    minPasswordLength: row.minPasswordLength,
    sessionTimeoutMinutes: row.sessionTimeoutMinutes,
    inactiveDisableDays: row.inactiveDisableDays,
    auditRetentionYears: row.auditRetentionYears,
    breachNoticeHours: row.breachNoticeHours,
    maxPlanUploadMb: row.maxPlanUploadMb,
    warehouseRefreshSchedule: row.warehouseRefreshSchedule,
    coiReminderDays: row.coiReminderDaysJson,
    requireMasterAgreement: row.requireMasterAgreement,
    currentMasterAgreementVersion: row.currentMasterAgreementVersion,
    defaultGlMinLimitCents: row.defaultGlMinLimitCents,
    defaultAutoMinLimitCents: row.defaultAutoMinLimitCents,
    poNumberFormat: row.poNumberFormat,
  };
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/api/admin/settings', { schema: { tags: ['Admin'] } }, async () => {
    if (isUsingDemoStore()) {
      return { settings: demoStore.settings };
    }
    const db = getDb();
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, 'default'))
      .limit(1);
    return { settings: mapSettingsRow(row) };
  });

  app.patch(
    '/api/admin/settings',
    {
      preHandler: [requirePermission('settings:manage')],
      schema: { tags: ['Admin'] },
    },
    async (request, reply) => {
      const parsed = updateSystemSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }

      if (isUsingDemoStore()) {
        const before = { ...demoStore.settings };
        Object.assign(demoStore.settings, parsed.data);

        await writeAuditLog({
          actorUserId: request.actor.userId,
          actorEmail: request.actor.email,
          action: 'SYSTEM_SETTINGS_UPDATED',
          entityType: 'system_settings',
          entityId: 'default',
          ipAddress: request.ip,
          beforeValues: before as unknown as Record<string, unknown>,
          afterValues: demoStore.settings as unknown as Record<string, unknown>,
        });

        return { settings: demoStore.settings };
      }

      const db = getDb();
      const [existing] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.id, 'default'))
        .limit(1);

      const before = mapSettingsRow(existing);
      const next: SystemSettingsConfig = { ...before, ...parsed.data };

      const [updated] = await db
        .insert(systemSettings)
        .values({
          id: 'default',
          minPasswordLength: next.minPasswordLength,
          sessionTimeoutMinutes: next.sessionTimeoutMinutes,
          inactiveDisableDays: next.inactiveDisableDays,
          auditRetentionYears: next.auditRetentionYears,
          breachNoticeHours: next.breachNoticeHours,
          maxPlanUploadMb: next.maxPlanUploadMb,
          warehouseRefreshSchedule: next.warehouseRefreshSchedule,
          coiReminderDaysJson: next.coiReminderDays,
          requireMasterAgreement: next.requireMasterAgreement,
          currentMasterAgreementVersion: next.currentMasterAgreementVersion,
          defaultGlMinLimitCents: next.defaultGlMinLimitCents,
          defaultAutoMinLimitCents: next.defaultAutoMinLimitCents,
          poNumberFormat: next.poNumberFormat,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.id,
          set: {
            minPasswordLength: next.minPasswordLength,
            sessionTimeoutMinutes: next.sessionTimeoutMinutes,
            inactiveDisableDays: next.inactiveDisableDays,
            auditRetentionYears: next.auditRetentionYears,
            breachNoticeHours: next.breachNoticeHours,
            maxPlanUploadMb: next.maxPlanUploadMb,
            warehouseRefreshSchedule: next.warehouseRefreshSchedule,
            coiReminderDaysJson: next.coiReminderDays,
            requireMasterAgreement: next.requireMasterAgreement,
            currentMasterAgreementVersion: next.currentMasterAgreementVersion,
            defaultGlMinLimitCents: next.defaultGlMinLimitCents,
            defaultAutoMinLimitCents: next.defaultAutoMinLimitCents,
            poNumberFormat: next.poNumberFormat,
            updatedAt: new Date(),
          },
        })
        .returning();

      const mapped = mapSettingsRow(updated);
      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'SYSTEM_SETTINGS_UPDATED',
        entityType: 'system_settings',
        entityId: 'default',
        ipAddress: request.ip,
        beforeValues: before as unknown as Record<string, unknown>,
        afterValues: mapped as unknown as Record<string, unknown>,
      });

      return { settings: mapped };
    }
  );

  app.get(
    '/api/admin/users',
    {
      preHandler: [requirePermission('users:manage')],
      schema: { tags: ['Admin'] },
    },
    async () => {
      if (isUsingDemoStore()) {
        return { users: demoStore.users };
      }

      const db = getDb();
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          subCompanyId: users.subCompanyId,
          status: users.status,
          mfaEnabled: users.mfaEnabled,
          approvalLimitCents: users.approvalLimitCents,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));

      return {
        users: rows.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        })),
      };
    }
  );

  app.get(
    '/api/admin/audit-logs',
    {
      preHandler: [requirePermission('audit_log:view')],
      schema: { tags: ['Admin'] },
    },
    async () => {
      if (isUsingDemoStore()) {
        return { auditLogs: demoStore.auditLogs };
      }

      const db = getDb();
      const rows = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(200);

      return {
        auditLogs: rows.map((r) => ({
          id: r.id,
          actorUserId: r.actorUserId,
          actorEmail: r.actorEmail ?? 'system@interstatehomes.com',
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          homeId: r.homeId,
          ipAddress: r.ipAddress ?? '',
          beforeValues: r.beforeValues,
          afterValues: r.afterValues,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    }
  );

  app.post(
    '/api/admin/warehouse/refresh',
    {
      preHandler: [requirePermission('settings:manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Admin-only manual refresh of warehouse dimension and fact tables',
      },
    },
    async (request, reply) => {
      if (isUsingDemoStore()) {
        const factEstimatesCount = Array.from(demoStore.estimates.values()).reduce(
          (sum, e) => sum + e.lines.length,
          0
        );
        const tables = {
          dimHomes: demoStore.homes.length,
          dimSubcontractors: demoStore.subcontractors.length,
          factEstimates: factEstimatesCount,
          factQuotes: demoStore.quotes.length,
          factPurchaseOrders: demoStore.purchaseOrders.length,
          factBudgets: demoStore.jobCostBudgets.length,
        };
        const rowsWritten = Object.values(tables).reduce((a, b) => a + b, 0);
        const runId = `wh-demo-${Date.now().toString(36)}`;

        await writeAuditLog({
          actorUserId: request.actor.userId,
          actorEmail: request.actor.email,
          action: 'WAREHOUSE_REFRESHED',
          entityType: 'warehouse_refresh_run',
          entityId: runId,
          ipAddress: request.ip,
          afterValues: { mode: 'demo', rowsWritten, tables },
        });

        return {
          ok: true,
          mode: 'demo',
          runId,
          status: 'succeeded',
          rowsWritten,
          tables,
          finishedAt: new Date().toISOString(),
        };
      }

      const db = getDb();
      const startedAt = new Date();
      const [run] = await db
        .insert(warehouseRefreshRuns)
        .values({
          triggerType: 'manual',
          status: 'running',
          rowsWritten: 0,
          startedAt,
        })
        .returning();

      try {
        const snapshotDate = startedAt.toISOString().slice(0, 10);
        const now = new Date();

        const tables = await db.transaction(async (tx) => {
          const [homeRows, subRows, estRows, lineRows, quoteRows, poRows, budgetRows] =
            await Promise.all([
              tx.select().from(homes),
              tx.select().from(subCompanies),
              tx.select().from(estimates),
              tx.select().from(estimateLines),
              tx.select().from(quotes),
              tx.select().from(purchaseOrders),
              tx.select().from(jobCostBudgets),
            ]);

          const estMap = new Map(estRows.map((e) => [e.id, e]));

          // 1. dim_homes
          await tx.delete(dimHomes);
          if (homeRows.length > 0) {
            await tx.insert(dimHomes).values(
              homeRows.map((h) => ({
                homeId: h.id,
                homeCode: h.homeCode,
                subdivisionCode: h.subdivisionCode,
                planName: h.planName,
                finishedSqFt: h.finishedSqFt,
                stage: h.stage,
                refreshedAt: now,
              }))
            );
          }

          // 2. dim_subcontractors
          await tx.delete(dimSubcontractors);
          if (subRows.length > 0) {
            await tx.insert(dimSubcontractors).values(
              subRows.map((s) => ({
                subCompanyId: s.id,
                legalName: s.legalName,
                companyType: s.companyType,
                status: s.status,
                refreshedAt: now,
              }))
            );
          }

          // 3. fact_estimates (idempotent per snapshotDate)
          await tx.delete(factEstimates).where(eq(factEstimates.snapshotDate, snapshotDate));
          const factEstValues = lineRows
            .map((l) => {
              const est = estMap.get(l.estimateId);
              if (!est) return null;
              return {
                homeId: est.homeId,
                estimateId: est.id,
                versionNumber: est.versionNumber,
                costCode: l.costCode,
                estimatedCents: l.extendedCents,
                snapshotDate,
              };
            })
            .filter((v): v is NonNullable<typeof v> => v !== null);
          if (factEstValues.length > 0) {
            await tx.insert(factEstimates).values(factEstValues);
          }

          // 4. fact_quotes (idempotent per snapshotDate)
          await tx.delete(factQuotes).where(eq(factQuotes.snapshotDate, snapshotDate));
          if (quoteRows.length > 0) {
            await tx.insert(factQuotes).values(
              quoteRows.map((q) => ({
                quoteId: q.id,
                homeId: q.homeId,
                subCompanyId: q.subCompanyId,
                costCode: q.costCode,
                status: q.status,
                quotedTotalCents: q.quotedTotalCents,
                snapshotDate,
              }))
            );
          }

          // 5. fact_purchase_orders (idempotent per snapshotDate)
          await tx
            .delete(factPurchaseOrders)
            .where(eq(factPurchaseOrders.snapshotDate, snapshotDate));
          if (poRows.length > 0) {
            await tx.insert(factPurchaseOrders).values(
              poRows.map((p) => ({
                poId: p.id,
                poNumber: p.poNumber,
                homeId: p.homeId,
                subCompanyId: p.subCompanyId,
                costCode: p.costCode,
                poType: p.poType,
                totalCents: p.totalCents,
                status: p.status,
                snapshotDate,
              }))
            );
          }

          // 6. fact_budgets
          await tx.delete(factBudgets);
          if (budgetRows.length > 0) {
            await tx.insert(factBudgets).values(
              budgetRows.map((b) => ({
                homeId: b.homeId,
                homeCode: b.homeCode,
                costCode: b.costCode,
                budgetCents: b.budgetCents,
                estimateVersion: b.estimateVersion,
                loadedAt: b.loadedAt,
              }))
            );
          }

          return {
            dimHomes: homeRows.length,
            dimSubcontractors: subRows.length,
            factEstimates: factEstValues.length,
            factQuotes: quoteRows.length,
            factPurchaseOrders: poRows.length,
            factBudgets: budgetRows.length,
          };
        });

        const rowsWritten = Object.values(tables).reduce((a, b) => a + b, 0);
        const finishedAt = new Date();

        await db
          .update(warehouseRefreshRuns)
          .set({
            status: 'succeeded',
            rowsWritten,
            finishedAt,
          })
          .where(eq(warehouseRefreshRuns.id, run!.id));

        await writeAuditLog({
          actorUserId: request.actor.userId,
          actorEmail: request.actor.email,
          action: 'WAREHOUSE_REFRESHED',
          entityType: 'warehouse_refresh_run',
          entityId: run!.id,
          ipAddress: request.ip,
          afterValues: { mode: 'postgres', rowsWritten, tables },
        });

        return {
          ok: true,
          mode: 'postgres',
          runId: run!.id,
          status: 'succeeded',
          rowsWritten,
          tables,
          finishedAt: finishedAt.toISOString(),
        };
      } catch (err) {
        await db
          .update(warehouseRefreshRuns)
          .set({ status: 'failed', finishedAt: new Date() })
          .where(eq(warehouseRefreshRuns.id, run!.id));
        return reply.status(500).send({
          error: 'WarehouseRefreshFailed',
          message: err instanceof Error ? err.message : 'Unknown warehouse refresh error',
          runId: run!.id,
        });
      }
    }
  );
}

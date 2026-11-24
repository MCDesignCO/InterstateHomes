import type { FastifyInstance } from 'fastify';
import {
  COST_CODE_MAP,
  checkSubComplianceForPO,
  createPurchaseOrderSchema,
  formatPoNumber,
} from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { requirePermission, requireRecentReauth } from '../security/auth-plugin.js';
import { writeAuditLog } from '../security/audit.js';
import { createPoDocuSealSubmission } from '../services/docuseal.js';

export async function registerPurchaseOrderRoutes(app: FastifyInstance) {
  app.get('/api/purchase-orders', { schema: { tags: ['Purchase Orders'] } }, async (request) => {
    const pos =
      request.actor.role === 'subcontractor' && request.actor.subCompanyId
        ? demoStore.purchaseOrders.filter((p) => p.subCompanyId === request.actor.subCompanyId)
        : demoStore.purchaseOrders;
    return { purchaseOrders: pos };
  });

  app.post(
    '/api/purchase-orders',
    {
      preHandler: [requirePermission('pos:issue')],
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Issue a compliance-gated Subcontractor or Supplier PO and create DocuSeal envelope',
      },
    },
    async (request, reply) => {
      const parsed = createPurchaseOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const home = demoStore.homes.find((h) => h.id === d.homeId);
      const sub = demoStore.subcontractors.find((s) => s.id === d.subId);
      const cc = COST_CODE_MAP.get(d.costCode);
      if (!home || !sub || !cc) {
        return reply.status(404).send({ error: 'ReferencedEntityNotFound' });
      }

      // Section 8.2 & Rule 4: Block PO if any required compliance document is missing/expired
      const compliance = checkSubComplianceForPO(
        { status: sub.status, hasVehiclesOnSite: sub.hasVehiclesOnSite },
        sub.complianceDocs,
        {
          poType: d.poType,
          requiresUtahLicense: cc.requiresUtahLicense,
          minGlLimitCents: demoStore.settings.defaultGlMinLimitCents,
          minAutoLimitCents: demoStore.settings.defaultAutoMinLimitCents,
          requireMasterAgreement: demoStore.settings.requireMasterAgreement,
          currentMasterAgreementVersion: demoStore.settings.currentMasterAgreementVersion,
        }
      );

      if (!compliance.eligible) {
        await writeAuditLog({
          actorUserId: request.actor.userId,
          actorEmail: request.actor.email,
          action: 'PO_BLOCKED_COMPLIANCE',
          entityType: 'subcontractor',
          entityId: sub.id,
          homeId: home.id,
          ipAddress: request.ip,
          afterValues: { costCode: d.costCode, blockingReasons: compliance.blockingReasons },
        });
        return reply.status(422).send({
          error: 'ComplianceBlocked',
          message: `${sub.legalName} cannot receive a PO due to compliance issues.`,
          blockingReasons: compliance.blockingReasons,
        });
      }

      const existingSameCodeCount = demoStore.purchaseOrders.filter(
        (p) => p.homeId === home.id && p.costCode === d.costCode
      ).length;
      const poNumber = formatPoNumber(
        home.subdivisionCode,
        home.lot,
        d.costCode,
        existingSameCodeCount + 1
      );

      const docuseal = await createPoDocuSealSubmission({
        poNumber,
        documentTitle: `${poNumber} — ${cc.name}`,
        subSignerName: sub.primaryContactName,
        subSignerEmail: sub.primaryContactEmail,
        approverName: request.actor.fullName,
        approverEmail: request.actor.email,
        masterAgreementRef:
          d.poType === 'subcontractor'
            ? `MSA v${demoStore.settings.currentMasterAgreementVersion}`
            : 'Supplier Terms',
        totalCents: d.totalCents,
      });

      const newPo = {
        id: `po-${poNumber.toLowerCase()}`,
        poNumber,
        homeId: home.id,
        homeCode: home.homeCode,
        costCode: d.costCode,
        costCodeName: cc.name,
        subCompanyId: sub.id,
        subName: sub.legalName,
        poType: d.poType,
        scopeSummary: d.scopeSummary,
        planRevision: d.planRevision,
        totalCents: d.totalCents,
        masterAgreementRef:
          d.poType === 'subcontractor'
            ? `MSA v${demoStore.settings.currentMasterAgreementVersion}`
            : null,
        status: 'pending_sub_signature' as const,
        docusealSubmissionId: docuseal.submissionId,
        subSignedAt: null,
        approverSignedAt: null,
      };

      demoStore.purchaseOrders.unshift(newPo);
      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'PO_ISSUED',
        entityType: 'purchase_order',
        entityId: poNumber,
        homeId: home.id,
        ipAddress: request.ip,
        afterValues: { poNumber, poType: d.poType, totalCents: d.totalCents },
      });

      return reply.status(201).send({ purchaseOrder: newPo, docuseal });
    }
  );

  app.post(
    '/api/purchase-orders/:id/sign',
    {
      preHandler: [requireRecentReauth(15)],
      schema: { tags: ['Purchase Orders'], summary: 'Record subcontractor or approver e-signature' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const po = demoStore.purchaseOrders.find((p) => p.id === id);
      if (!po) return reply.status(404).send({ error: 'PurchaseOrderNotFound' });

      const prevStatus = po.status;
      if (po.status === 'pending_sub_signature') {
        po.status = 'pending_approver_signature';
        po.subSignedAt = new Date().toISOString();
      } else if (po.status === 'pending_approver_signature') {
        po.status = 'fully_signed';
        po.approverSignedAt = new Date().toISOString();
      }

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'PO_SIGNED',
        entityType: 'purchase_order',
        entityId: po.poNumber,
        homeId: po.homeId,
        ipAddress: request.ip,
        beforeValues: { status: prevStatus },
        afterValues: { status: po.status },
      });

      return { purchaseOrder: po };
    }
  );
}

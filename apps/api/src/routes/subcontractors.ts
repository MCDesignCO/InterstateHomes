import type { FastifyInstance } from 'fastify';
import {
  COST_CODE_MAP,
  checkSubComplianceForPO,
  createSubcontractorSchema,
} from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { writeAuditLog } from '../security/audit.js';

export async function registerSubcontractorRoutes(app: FastifyInstance) {
  app.get('/api/subcontractors', { schema: { tags: ['Subcontractors'] } }, async (request) => {
    const subs =
      request.actor.role === 'subcontractor' && request.actor.subCompanyId
        ? demoStore.subcontractors.filter((s) => s.id === request.actor.subCompanyId)
        : demoStore.subcontractors;

    return {
      subcontractors: subs.map((s) => ({
        ...s,
        complianceStatus: checkSubComplianceForPO(
          { status: s.status, hasVehiclesOnSite: s.hasVehiclesOnSite },
          s.complianceDocs,
          {
            poType: s.companyType === 'supplier' ? 'supplier' : 'subcontractor',
            requiresUtahLicense: s.companyType !== 'supplier',
            minGlLimitCents: demoStore.settings.defaultGlMinLimitCents,
            requireMasterAgreement: demoStore.settings.requireMasterAgreement,
            currentMasterAgreementVersion: demoStore.settings.currentMasterAgreementVersion,
          }
        ),
      })),
    };
  });

  app.get(
    '/api/subcontractors/:id/compliance-check',
    { schema: { tags: ['Subcontractors'] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { costCode = '31', poType = 'subcontractor' } = request.query as {
        costCode?: string;
        poType?: 'subcontractor' | 'supplier';
      };

      const sub = demoStore.subcontractors.find((s) => s.id === id);
      if (!sub) return reply.status(404).send({ error: 'SubcontractorNotFound' });

      const cc = COST_CODE_MAP.get(costCode);
      const result = checkSubComplianceForPO(
        { status: sub.status, hasVehiclesOnSite: sub.hasVehiclesOnSite },
        sub.complianceDocs,
        {
          poType,
          requiresUtahLicense: cc?.requiresUtahLicense ?? false,
          minGlLimitCents: demoStore.settings.defaultGlMinLimitCents,
          requireMasterAgreement: demoStore.settings.requireMasterAgreement,
          currentMasterAgreementVersion: demoStore.settings.currentMasterAgreementVersion,
        }
      );

      return { subId: sub.id, legalName: sub.legalName, costCode, poType, ...result };
    }
  );

  app.post('/api/subcontractors', { schema: { tags: ['Subcontractors'] } }, async (request, reply) => {
    const parsed = createSubcontractorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const id = `sub-${Date.now().toString(36)}`;
    const newSub = {
      id,
      legalName: d.legalName,
      dbaName: d.dbaName ?? null,
      companyType: d.companyType,
      mainPhone: d.mainPhone ?? '',
      primaryContactName: 'Primary Contact',
      primaryContactEmail: 'office@example.com',
      hasVehiclesOnSite: d.hasVehiclesOnSite,
      status: 'active' as const,
      costCodesServed: d.costCodesServed,
      subdivisionsServed: d.subdivisionsServed,
      preferredForCodes: [],
      paymentTermsNetDays: d.paymentTermsNetDays,
      w9TinMasked: '***-**-0000',
      lastPricingUpdatedAt: new Date().toISOString().slice(0, 10),
      complianceDocs: [],
    };
    demoStore.subcontractors.push(newSub);
    await writeAuditLog({
      actorUserId: request.actor.userId,
      actorEmail: request.actor.email,
      action: 'SUBCONTRACTOR_CREATED',
      entityType: 'subcontractor',
      entityId: id,
      ipAddress: request.ip,
      afterValues: { legalName: d.legalName, costCodesServed: d.costCodesServed },
    });
    return reply.status(201).send({ subcontractor: newSub });
  });

  app.get('/api/price-sheets', { schema: { tags: ['Price Sheets'] } }, async (request) => {
    const sheets =
      request.actor.role === 'subcontractor' && request.actor.subCompanyId
        ? demoStore.priceSheets.filter((p) => p.subCompanyId === request.actor.subCompanyId)
        : demoStore.priceSheets;
    return { priceSheets: sheets };
  });
}

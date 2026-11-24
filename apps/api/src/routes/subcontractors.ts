import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  COST_CODE_MAP,
  DEFAULT_SYSTEM_SETTINGS,
  canAccess,
  checkSubComplianceForPO,
  costCodeTextSchema,
  createSubcontractorSchema,
  type ComplianceDocRecord,
  type ComplianceDocType,
} from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { getDb } from '../db/client.js';
import {
  complianceDocuments,
  costCodes,
  priceSheetItems,
  priceSheets,
  subCompanies,
  subContacts,
  subCostCodes,
  systemSettings,
} from '../db/schema/index.js';
import { isUsingDemoStore } from '../security/auth-plugin.js';
import { isValidUuid, writeAuditLog } from '../security/audit.js';

const createPriceSheetSchema = z.object({
  subCompanyId: z.string().min(1),
  costCode: costCodeTextSchema,
  subdivisionScope: z.string().min(1).max(32).default('ALL'),
  effectiveFrom: z.string().min(8).max(20),
  effectiveTo: z.string().min(8).max(20).nullable().optional(),
  minimumChargeCents: z.number().int().nonnegative().nullable().optional(),
  inclusionsExclusions: z.string().max(2000).default(''),
  items: z
    .array(
      z.object({
        subLineName: z.string().min(1).max(200),
        unit: z.string().min(1).max(32),
        unitPriceCents: z.number().int().nonnegative(),
        notes: z.string().max(500).optional(),
      })
    )
    .min(1),
});

async function getComplianceSettingsFromDb() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, 'default'))
    .limit(1);
  return {
    defaultGlMinLimitCents:
      row?.defaultGlMinLimitCents ?? DEFAULT_SYSTEM_SETTINGS.defaultGlMinLimitCents,
    defaultAutoMinLimitCents:
      row?.defaultAutoMinLimitCents ?? DEFAULT_SYSTEM_SETTINGS.defaultAutoMinLimitCents,
    requireMasterAgreement:
      row?.requireMasterAgreement ?? DEFAULT_SYSTEM_SETTINGS.requireMasterAgreement,
    currentMasterAgreementVersion:
      row?.currentMasterAgreementVersion ?? DEFAULT_SYSTEM_SETTINGS.currentMasterAgreementVersion,
  };
}

function mapComplianceDocs(rows: Array<typeof complianceDocuments.$inferSelect>): ComplianceDocRecord[] {
  return rows.map((d) => ({
    docType: d.docType as ComplianceDocType,
    reviewStatus: d.reviewStatus as 'pending' | 'approved' | 'rejected',
    expiresAt: d.expiresAt ?? null,
    limitAmountCents: d.limitAmountCents ?? null,
    additionalInsured: d.additionalInsured ?? false,
    licenseClassification: d.licenseClassification ?? null,
    agreementVersion: d.agreementVersion ?? null,
  }));
}

export async function registerSubcontractorRoutes(app: FastifyInstance) {
  app.get('/api/subcontractors', { schema: { tags: ['Subcontractors'] } }, async (request) => {
    if (isUsingDemoStore()) {
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
              minAutoLimitCents: demoStore.settings.defaultAutoMinLimitCents,
              requireMasterAgreement: demoStore.settings.requireMasterAgreement,
              currentMasterAgreementVersion: demoStore.settings.currentMasterAgreementVersion,
            }
          ),
        })),
      };
    }

    const db = getDb();
    const isSubRole = request.actor.role === 'subcontractor';
    const subFilterId =
      isSubRole && isValidUuid(request.actor.subCompanyId) ? request.actor.subCompanyId : null;

    if (isSubRole && !subFilterId) {
      return { subcontractors: [] };
    }

    const [companies, contacts, costCodeLinks, docs, sheets, settings] = await Promise.all([
      subFilterId
        ? db.select().from(subCompanies).where(eq(subCompanies.id, subFilterId))
        : db.select().from(subCompanies).orderBy(desc(subCompanies.createdAt)),
      db.select().from(subContacts),
      db.select().from(subCostCodes),
      db.select().from(complianceDocuments).orderBy(desc(complianceDocuments.receivedAt)),
      db.select().from(priceSheets).orderBy(desc(priceSheets.createdAt)),
      getComplianceSettingsFromDb(),
    ]);

    const contactsBySub = new Map<string, Array<typeof subContacts.$inferSelect>>();
    for (const c of contacts) {
      const list = contactsBySub.get(c.subCompanyId) ?? [];
      list.push(c);
      contactsBySub.set(c.subCompanyId, list);
    }

    const linksBySub = new Map<string, Array<typeof subCostCodes.$inferSelect>>();
    for (const l of costCodeLinks) {
      const list = linksBySub.get(l.subCompanyId) ?? [];
      list.push(l);
      linksBySub.set(l.subCompanyId, list);
    }

    const docsBySub = new Map<string, Array<typeof complianceDocuments.$inferSelect>>();
    for (const d of docs) {
      const list = docsBySub.get(d.subCompanyId) ?? [];
      list.push(d);
      docsBySub.set(d.subCompanyId, list);
    }

    const latestPricingBySub = new Map<string, string>();
    for (const ps of sheets) {
      if (!latestPricingBySub.has(ps.subCompanyId)) {
        latestPricingBySub.set(ps.subCompanyId, ps.effectiveFrom);
      }
    }

    return {
      subcontractors: companies.map((s) => {
        const subContactList = contactsBySub.get(s.id) ?? [];
        const primaryContact = subContactList.find((c) => c.isSigner) ?? subContactList[0];
        const links = linksBySub.get(s.id) ?? [];
        const subDocsRaw = docsBySub.get(s.id) ?? [];
        const mappedDocs = mapComplianceDocs(subDocsRaw);
        const w9Doc = subDocsRaw.find((d) => d.docType === 'w9' && d.w9TinLast4);

        const costCodesServed = Array.from(new Set(links.map((l) => l.costCode)));
        const subdivisionsServed = Array.from(
          new Set(links.map((l) => l.subdivisionCode ?? 'ALL'))
        );
        const preferredForCodes = Array.from(
          new Set(links.filter((l) => l.isPreferred).map((l) => l.costCode))
        );

        const complianceStatus = checkSubComplianceForPO(
          {
            status: s.status as 'active' | 'on_hold' | 'inactive',
            hasVehiclesOnSite: s.hasVehiclesOnSite,
          },
          mappedDocs,
          {
            poType: s.companyType === 'supplier' ? 'supplier' : 'subcontractor',
            requiresUtahLicense: s.companyType !== 'supplier',
            minGlLimitCents: settings.defaultGlMinLimitCents,
            minAutoLimitCents: settings.defaultAutoMinLimitCents,
            requireMasterAgreement: settings.requireMasterAgreement,
            currentMasterAgreementVersion: settings.currentMasterAgreementVersion,
          }
        );

        return {
          id: s.id,
          legalName: s.legalName,
          dbaName: s.dbaName,
          companyType: s.companyType,
          mainPhone: s.mainPhone ?? '',
          primaryContactName: primaryContact?.fullName ?? 'Primary Contact',
          primaryContactEmail: primaryContact?.email ?? '',
          hasVehiclesOnSite: s.hasVehiclesOnSite,
          status: s.status,
          costCodesServed,
          subdivisionsServed: subdivisionsServed.length > 0 ? subdivisionsServed : ['ALL'],
          preferredForCodes,
          paymentTermsNetDays: s.paymentTermsNetDays,
          w9TinMasked: w9Doc?.w9TinLast4 ? `***-**-${w9Doc.w9TinLast4}` : '***-**-****',
          lastPricingUpdatedAt:
            latestPricingBySub.get(s.id) ?? s.updatedAt.toISOString().slice(0, 10),
          complianceDocs: mappedDocs,
          complianceStatus,
        };
      }),
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

      if (isUsingDemoStore()) {
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
            minAutoLimitCents: demoStore.settings.defaultAutoMinLimitCents,
            requireMasterAgreement: demoStore.settings.requireMasterAgreement,
            currentMasterAgreementVersion: demoStore.settings.currentMasterAgreementVersion,
          }
        );

        return { subId: sub.id, legalName: sub.legalName, costCode, poType, ...result };
      }

      if (!isValidUuid(id)) {
        return reply.status(404).send({ error: 'SubcontractorNotFound' });
      }

      const db = getDb();
      const [[sub], docs, [dbCc], settings] = await Promise.all([
        db.select().from(subCompanies).where(eq(subCompanies.id, id)).limit(1),
        db
          .select()
          .from(complianceDocuments)
          .where(eq(complianceDocuments.subCompanyId, id))
          .orderBy(desc(complianceDocuments.receivedAt)),
        db.select().from(costCodes).where(eq(costCodes.code, costCode)).limit(1),
        getComplianceSettingsFromDb(),
      ]);

      if (!sub) return reply.status(404).send({ error: 'SubcontractorNotFound' });

      const requiresUtahLicense =
        dbCc?.requiresUtahLicense ?? COST_CODE_MAP.get(costCode)?.requiresUtahLicense ?? false;

      const result = checkSubComplianceForPO(
        {
          status: sub.status as 'active' | 'on_hold' | 'inactive',
          hasVehiclesOnSite: sub.hasVehiclesOnSite,
        },
        mapComplianceDocs(docs),
        {
          poType,
          requiresUtahLicense,
          minGlLimitCents: settings.defaultGlMinLimitCents,
          minAutoLimitCents: settings.defaultAutoMinLimitCents,
          requireMasterAgreement: settings.requireMasterAgreement,
          currentMasterAgreementVersion: settings.currentMasterAgreementVersion,
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

    if (isUsingDemoStore()) {
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
    }

    const db = getDb();
    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(subCompanies)
        .values({
          legalName: d.legalName,
          dbaName: d.dbaName ?? null,
          companyType: d.companyType,
          address: d.address ?? null,
          mainPhone: d.mainPhone ?? null,
          website: d.website ?? null,
          hasVehiclesOnSite: d.hasVehiclesOnSite,
          status: 'active',
          paymentTermsNetDays: d.paymentTermsNetDays,
          retainagePercent: String(d.retainagePercent),
        })
        .returning();

      const subScopeList = d.subdivisionsServed.length > 0 ? d.subdivisionsServed : ['ALL'];
      const linkValues: Array<{
        subCompanyId: string;
        costCode: string;
        subdivisionCode: string | null;
        isPreferred: boolean;
      }> = [];

      for (const code of d.costCodesServed) {
        for (const subDiv of subScopeList) {
          linkValues.push({
            subCompanyId: inserted!.id,
            costCode: code,
            subdivisionCode: subDiv === 'ALL' ? null : subDiv,
            isPreferred: false,
          });
        }
      }

      if (linkValues.length > 0) {
        await tx.insert(subCostCodes).values(linkValues);
      }

      return inserted!;
    });

    await writeAuditLog({
      actorUserId: request.actor.userId,
      actorEmail: request.actor.email,
      action: 'SUBCONTRACTOR_CREATED',
      entityType: 'subcontractor',
      entityId: created.id,
      ipAddress: request.ip,
      afterValues: { legalName: d.legalName, costCodesServed: d.costCodesServed },
    });

    return reply.status(201).send({
      subcontractor: {
        id: created.id,
        legalName: created.legalName,
        dbaName: created.dbaName,
        companyType: created.companyType,
        mainPhone: created.mainPhone ?? '',
        primaryContactName: 'Primary Contact',
        primaryContactEmail: '',
        hasVehiclesOnSite: created.hasVehiclesOnSite,
        status: created.status,
        costCodesServed: d.costCodesServed,
        subdivisionsServed: d.subdivisionsServed,
        preferredForCodes: [],
        paymentTermsNetDays: created.paymentTermsNetDays,
        w9TinMasked: '***-**-****',
        lastPricingUpdatedAt: created.createdAt.toISOString().slice(0, 10),
        complianceDocs: [],
      },
    });
  });

  app.get('/api/price-sheets', { schema: { tags: ['Price Sheets'] } }, async (request) => {
    if (isUsingDemoStore()) {
      const sheets =
        request.actor.role === 'subcontractor' && request.actor.subCompanyId
          ? demoStore.priceSheets.filter((p) => p.subCompanyId === request.actor.subCompanyId)
          : demoStore.priceSheets;
      return { priceSheets: sheets };
    }

    const db = getDb();
    const isSubRole = request.actor.role === 'subcontractor';
    const subFilterId =
      isSubRole && isValidUuid(request.actor.subCompanyId) ? request.actor.subCompanyId : null;

    if (isSubRole && !subFilterId) {
      return { priceSheets: [] };
    }

    const [sheetRows, itemRows, subRows, codeRows] = await Promise.all([
      subFilterId
        ? db
            .select()
            .from(priceSheets)
            .where(eq(priceSheets.subCompanyId, subFilterId))
            .orderBy(desc(priceSheets.createdAt))
        : db.select().from(priceSheets).orderBy(desc(priceSheets.createdAt)),
      db.select().from(priceSheetItems),
      db.select().from(subCompanies),
      db.select().from(costCodes),
    ]);

    const subMap = new Map(subRows.map((s) => [s.id, s.legalName]));
    const codeMap = new Map(codeRows.map((c) => [c.code, c.name]));
    const itemsBySheet = new Map<
      string,
      Array<{ id: string; subLineName: string; unit: string; unitPriceCents: number }>
    >();
    for (const item of itemRows) {
      const list = itemsBySheet.get(item.priceSheetId) ?? [];
      list.push({
        id: item.id,
        subLineName: item.subLineName,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
      });
      itemsBySheet.set(item.priceSheetId, list);
    }

    return {
      priceSheets: sheetRows.map((ps) => ({
        id: ps.id,
        subCompanyId: ps.subCompanyId,
        subName: subMap.get(ps.subCompanyId) ?? ps.subCompanyId,
        costCode: ps.costCode,
        costCodeName: codeMap.get(ps.costCode) ?? ps.costCode,
        subdivisionScope: ps.subdivisionScope,
        effectiveFrom: ps.effectiveFrom,
        effectiveTo: ps.effectiveTo,
        inclusionsExclusions: ps.inclusionsExclusions ?? '',
        items: itemsBySheet.get(ps.id) ?? [],
      })),
    };
  });

  app.post('/api/price-sheets', { schema: { tags: ['Price Sheets'] } }, async (request, reply) => {
    const parsed = createPriceSheetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }
    const d = parsed.data;

    const canEditAny = canAccess(request.actor.role, 'price_sheets:edit_any');
    const canEditOwn =
      canAccess(request.actor.role, 'price_sheets:edit_own') &&
      request.actor.subCompanyId === d.subCompanyId;
    if (!canEditAny && !canEditOwn) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    if (isUsingDemoStore()) {
      const sub = demoStore.subcontractors.find((s) => s.id === d.subCompanyId);
      const cc = COST_CODE_MAP.get(d.costCode);
      if (!sub || !cc) {
        return reply.status(404).send({ error: 'ReferencedEntityNotFound' });
      }
      const id = `ps-${Date.now().toString(36)}`;
      const sheet = {
        id,
        subCompanyId: sub.id,
        subName: sub.legalName,
        costCode: d.costCode,
        costCodeName: cc.name,
        subdivisionScope: d.subdivisionScope,
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo ?? null,
        inclusionsExclusions: d.inclusionsExclusions,
        items: d.items.map((item, idx) => ({
          id: `${id}-i${idx + 1}`,
          subLineName: item.subLineName,
          unit: item.unit,
          unitPriceCents: item.unitPriceCents,
        })),
      };
      demoStore.priceSheets.unshift(sheet);
      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'PRICE_SHEET_CREATED',
        entityType: 'price_sheet',
        entityId: id,
        ipAddress: request.ip,
        afterValues: { subCompanyId: sub.id, costCode: d.costCode, itemCount: d.items.length },
      });
      return reply.status(201).send({ priceSheet: sheet });
    }

    if (!isValidUuid(d.subCompanyId)) {
      return reply.status(404).send({ error: 'SubcontractorNotFound' });
    }
    const db = getDb();
    const [[sub], [cc]] = await Promise.all([
      db.select().from(subCompanies).where(eq(subCompanies.id, d.subCompanyId)).limit(1),
      db.select().from(costCodes).where(eq(costCodes.code, d.costCode)).limit(1),
    ]);
    if (!sub || !cc) {
      return reply.status(404).send({ error: 'ReferencedEntityNotFound' });
    }

    const result = await db.transaction(async (tx) => {
      const [sheet] = await tx
        .insert(priceSheets)
        .values({
          subCompanyId: sub.id,
          costCode: cc.code,
          subdivisionScope: d.subdivisionScope,
          effectiveFrom: d.effectiveFrom,
          effectiveTo: d.effectiveTo ?? null,
          minimumChargeCents: d.minimumChargeCents ?? null,
          inclusionsExclusions: d.inclusionsExclusions,
          updatedByUserId: isValidUuid(request.actor.userId) ? request.actor.userId : null,
        })
        .returning();

      const insertedItems = await tx
        .insert(priceSheetItems)
        .values(
          d.items.map((item) => ({
            priceSheetId: sheet!.id,
            subLineName: item.subLineName,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            notes: item.notes ?? null,
          }))
        )
        .returning();

      return { sheet: sheet!, items: insertedItems };
    });

    await writeAuditLog({
      actorUserId: request.actor.userId,
      actorEmail: request.actor.email,
      action: 'PRICE_SHEET_CREATED',
      entityType: 'price_sheet',
      entityId: result.sheet.id,
      ipAddress: request.ip,
      afterValues: { subCompanyId: sub.id, costCode: d.costCode, itemCount: result.items.length },
    });

    return reply.status(201).send({
      priceSheet: {
        id: result.sheet.id,
        subCompanyId: result.sheet.subCompanyId,
        subName: sub.legalName,
        costCode: result.sheet.costCode,
        costCodeName: cc.name,
        subdivisionScope: result.sheet.subdivisionScope,
        effectiveFrom: result.sheet.effectiveFrom,
        effectiveTo: result.sheet.effectiveTo,
        inclusionsExclusions: result.sheet.inclusionsExclusions ?? '',
        items: result.items.map((i) => ({
          id: i.id,
          subLineName: i.subLineName,
          unit: i.unit,
          unitPriceCents: i.unitPriceCents,
        })),
      },
    });
  });
}

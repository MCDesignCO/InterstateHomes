import type { FastifyInstance } from 'fastify';
import { asc, desc, eq } from 'drizzle-orm';
import { COST_CODES, canAccess, createHomeSchema } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { getDb } from '../db/client.js';
import {
  costCodes,
  estimateLines,
  estimates,
  homePlanRevisions,
  homes,
  planLibraryQuantities,
  subdivisions,
} from '../db/schema/index.js';
import { isUsingDemoStore, requirePermission } from '../security/auth-plugin.js';
import { isValidUuid, writeAuditLog } from '../security/audit.js';

export async function registerHomesRoutes(app: FastifyInstance) {
  app.get('/api/homes', { schema: { tags: ['Homes & Plans'] } }, async (request) => {
    const canSeeInternal = canAccess(request.actor.role, 'financials:view_internal');

    if (isUsingDemoStore()) {
      return {
        homes: demoStore.homes.map((h) => ({
          ...h,
          soldAmountCents: canSeeInternal ? h.soldAmountCents : null,
        })),
      };
    }

    const db = getDb();
    const [homeRows, subRows, revRows] = await Promise.all([
      db.select().from(homes).orderBy(desc(homes.createdAt)),
      db.select().from(subdivisions),
      db.select().from(homePlanRevisions).orderBy(desc(homePlanRevisions.uploadedAt)),
    ]);

    const subMap = new Map(subRows.map((s) => [s.code, s.name]));
    const latestRevByHome = new Map<string, string>();
    for (const r of revRows) {
      if (!latestRevByHome.has(r.homeId)) {
        latestRevByHome.set(r.homeId, r.revisionLabel);
      }
    }

    return {
      homes: homeRows.map((h) => ({
        id: h.id,
        homeCode: h.homeCode,
        subdivisionCode: h.subdivisionCode,
        subdivisionName: subMap.get(h.subdivisionCode) ?? h.subdivisionCode,
        lot: h.lot,
        address: h.address,
        planName: h.planName,
        elevation: h.elevation,
        garageHanding: h.garageHanding,
        finishedSqFt: h.finishedSqFt,
        garageSqFt: h.garageSqFt,
        bedrooms: h.bedrooms,
        baths: Number(h.baths),
        stories: h.stories,
        roofPitch: h.roofPitch,
        exteriorFinishMix: h.exteriorFinishMix,
        stage: h.stage,
        soldAmountCents: canSeeInternal ? h.soldAmountCents : null,
        planRevision: latestRevByHome.get(h.id) ?? 'Rev 1',
        createdAt: h.createdAt.toISOString(),
      })),
    };
  });

  app.get('/api/homes/:id', { schema: { tags: ['Homes & Plans'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const canSeeInternal = canAccess(request.actor.role, 'financials:view_internal');

    if (isUsingDemoStore()) {
      const home = demoStore.homes.find((h) => h.id === id);
      if (!home) return reply.status(404).send({ error: 'HomeNotFound' });
      return {
        home: {
          ...home,
          soldAmountCents: canSeeInternal ? home.soldAmountCents : null,
        },
      };
    }

    if (!isValidUuid(id)) {
      return reply.status(404).send({ error: 'HomeNotFound' });
    }

    const db = getDb();
    const [home] = await db.select().from(homes).where(eq(homes.id, id)).limit(1);
    if (!home) return reply.status(404).send({ error: 'HomeNotFound' });

    const [[sub], [latestRev]] = await Promise.all([
      db
        .select()
        .from(subdivisions)
        .where(eq(subdivisions.code, home.subdivisionCode))
        .limit(1),
      db
        .select()
        .from(homePlanRevisions)
        .where(eq(homePlanRevisions.homeId, home.id))
        .orderBy(desc(homePlanRevisions.uploadedAt))
        .limit(1),
    ]);

    return {
      home: {
        id: home.id,
        homeCode: home.homeCode,
        subdivisionCode: home.subdivisionCode,
        subdivisionName: sub?.name ?? home.subdivisionCode,
        lot: home.lot,
        address: home.address,
        planName: home.planName,
        elevation: home.elevation,
        garageHanding: home.garageHanding,
        finishedSqFt: home.finishedSqFt,
        garageSqFt: home.garageSqFt,
        bedrooms: home.bedrooms,
        baths: Number(home.baths),
        stories: home.stories,
        roofPitch: home.roofPitch,
        exteriorFinishMix: home.exteriorFinishMix,
        stage: home.stage,
        soldAmountCents: canSeeInternal ? home.soldAmountCents : null,
        planRevision: latestRev?.revisionLabel ?? 'Rev 1',
        createdAt: home.createdAt.toISOString(),
      },
    };
  });

  app.post(
    '/api/homes',
    {
      preHandler: [requirePermission('plans:intake')],
      schema: { tags: ['Homes & Plans'], summary: 'Intake a new home and initialize 81-line estimate' },
    },
    async (request, reply) => {
      const parsed = createHomeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const subCode = d.subdivisionCode.trim().toUpperCase();
      const homeCode = `${subCode} ${d.lot.trim()}`;

      if (isUsingDemoStore()) {
        if (demoStore.homes.some((h) => h.homeCode === homeCode)) {
          return reply.status(409).send({ error: 'DuplicateHomeCode', message: `${homeCode} already exists.` });
        }

        const id = `home-${subCode.toLowerCase()}-${d.lot.trim().toLowerCase()}-${Date.now().toString(36)}`;
        const newHome = {
          id,
          homeCode,
          subdivisionCode: subCode,
          subdivisionName: demoStore.helper.getSubdivisionName(subCode),
          lot: d.lot.trim(),
          address: d.address,
          planName: d.planName,
          elevation: d.elevation,
          garageHanding: d.garageHanding,
          finishedSqFt: d.finishedSqFt,
          garageSqFt: d.garageSqFt,
          bedrooms: d.bedrooms,
          baths: d.baths,
          stories: d.stories,
          roofPitch: d.roofPitch,
          exteriorFinishMix: d.exteriorFinishMix,
          stage: 'plan_intake' as const,
          soldAmountCents: null,
          planRevision: 'Rev 1',
          createdAt: new Date().toISOString(),
        };

        demoStore.homes.unshift(newHome);
        demoStore.estimates.set(id, {
          id: `est-${id}`,
          homeId: id,
          versionNumber: 1,
          status: 'draft',
          lines: COST_CODES.map((cc) => ({
            costCode: cc.code,
            costCodeName: cc.name,
            classificationCode: cc.classificationCode,
            classificationName: cc.classificationName,
            quantity: cc.isEstimateable ? 1 : 0,
            unit: 'LS',
            quantitySource: 'manual',
            pricingSource: cc.pricingSources[0] ?? 'none',
            selectedSubId: null,
            selectedSubName: null,
            unitPriceCents: 0,
            extendedCents: 0,
            isAllowanceOrFixed:
              cc.pricingSources[0] === 'fixed' || cc.pricingSources[0] === 'allowance',
            showOnHomeownerPdf: !cc.isInternalOnly,
            notes: '',
            competingSubQuotes: [],
          })),
        });

        await writeAuditLog({
          actorUserId: request.actor.userId,
          actorEmail: request.actor.email,
          action: 'HOME_INTAKE_CREATED',
          entityType: 'home',
          entityId: homeCode,
          homeId: id,
          ipAddress: request.ip,
          afterValues: { homeCode, planName: d.planName, finishedSqFt: d.finishedSqFt },
        });

        return reply.status(201).send({ home: newHome });
      }

      // Postgres mode
      const db = getDb();
      const [[subdivision], [existingHome]] = await Promise.all([
        db.select().from(subdivisions).where(eq(subdivisions.code, subCode)).limit(1),
        db.select({ id: homes.id }).from(homes).where(eq(homes.homeCode, homeCode)).limit(1),
      ]);

      if (!subdivision) {
        return reply.status(400).send({
          error: 'InvalidSubdivision',
          message: `Subdivision "${subCode}" does not exist.`,
        });
      }
      if (existingHome) {
        return reply.status(409).send({
          error: 'DuplicateHomeCode',
          message: `${homeCode} already exists.`,
        });
      }

      const planId = isValidUuid(d.planLibraryId) ? d.planLibraryId : null;
      const [activeCodes, planQtys] = await Promise.all([
        db
          .select()
          .from(costCodes)
          .where(eq(costCodes.active, true))
          .orderBy(asc(costCodes.sortOrder)),
        planId
          ? db.select().from(planLibraryQuantities).where(eq(planLibraryQuantities.planId, planId))
          : Promise.resolve([]),
      ]);

      const planQtyMap = new Map(planQtys.map((q) => [q.costCode, q]));

      const createdHome = await db.transaction(async (tx) => {
        const [insertedHome] = await tx
          .insert(homes)
          .values({
            homeCode,
            subdivisionCode: subCode,
            lot: d.lot.trim(),
            address: d.address,
            planId,
            planName: d.planName,
            elevation: d.elevation,
            garageHanding: d.garageHanding,
            optionsJson: d.optionsSelected,
            finishedSqFt: d.finishedSqFt,
            garageSqFt: d.garageSqFt,
            bedrooms: d.bedrooms,
            baths: String(d.baths),
            stories: d.stories,
            plateHeightFt: String(d.plateHeightFt),
            roofPitch: d.roofPitch,
            exteriorFinishMix: d.exteriorFinishMix,
            stage: 'plan_intake',
            soldAmountCents: null,
            createdBy: isValidUuid(request.actor.userId) ? request.actor.userId : null,
          })
          .returning();

        const [insertedEstimate] = await tx
          .insert(estimates)
          .values({
            homeId: insertedHome!.id,
            versionNumber: 1,
            status: 'draft',
          })
          .returning();

        if (activeCodes.length > 0) {
          await tx.insert(estimateLines).values(
            activeCodes.map((cc) => {
              const planQty = planQtyMap.get(cc.code);
              const defaultSource = cc.pricingSourcesJson[0] ?? 'none';
              return {
                estimateId: insertedEstimate!.id,
                costCode: cc.code,
                quantity: planQty ? planQty.quantity : cc.isEstimateable ? '1' : '0',
                unit: planQty ? planQty.unit : 'LS',
                quantitySource: planQty ? 'plan_library' : 'manual',
                pricingSource: defaultSource,
                selectedSubId: null,
                unitPriceCents: 0,
                extendedCents: 0,
                isAllowanceOrFixed: defaultSource === 'fixed' || defaultSource === 'allowance',
                showOnHomeownerPdf: !cc.isInternalOnly,
                notes: '',
              };
            })
          );
        }

        return insertedHome!;
      });

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'HOME_INTAKE_CREATED',
        entityType: 'home',
        entityId: homeCode,
        homeId: createdHome.id,
        ipAddress: request.ip,
        afterValues: { homeCode, planName: d.planName, finishedSqFt: d.finishedSqFt },
      });

      return reply.status(201).send({
        home: {
          id: createdHome.id,
          homeCode: createdHome.homeCode,
          subdivisionCode: createdHome.subdivisionCode,
          subdivisionName: subdivision.name,
          lot: createdHome.lot,
          address: createdHome.address,
          planName: createdHome.planName,
          elevation: createdHome.elevation,
          garageHanding: createdHome.garageHanding,
          finishedSqFt: createdHome.finishedSqFt,
          garageSqFt: createdHome.garageSqFt,
          bedrooms: createdHome.bedrooms,
          baths: Number(createdHome.baths),
          stories: createdHome.stories,
          roofPitch: createdHome.roofPitch,
          exteriorFinishMix: createdHome.exteriorFinishMix,
          stage: createdHome.stage,
          soldAmountCents: null,
          planRevision: 'Rev 1',
          createdAt: createdHome.createdAt.toISOString(),
        },
      });
    }
  );
}

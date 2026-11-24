import type { FastifyInstance } from 'fastify';
import { COST_CODES, canAccess, createHomeSchema } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { requirePermission } from '../security/auth-plugin.js';
import { writeAuditLog } from '../security/audit.js';

export async function registerHomesRoutes(app: FastifyInstance) {
  app.get('/api/homes', { schema: { tags: ['Homes & Plans'] } }, async (request) => {
    const canSeeInternal = canAccess(request.actor.role, 'financials:view_internal');
    return {
      homes: demoStore.homes.map((h) => ({
        ...h,
        soldAmountCents: canSeeInternal ? h.soldAmountCents : null,
      })),
    };
  });

  app.get('/api/homes/:id', { schema: { tags: ['Homes & Plans'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const home = demoStore.homes.find((h) => h.id === id);
    if (!home) return reply.status(404).send({ error: 'HomeNotFound' });
    const canSeeInternal = canAccess(request.actor.role, 'financials:view_internal');
    return {
      home: {
        ...home,
        soldAmountCents: canSeeInternal ? home.soldAmountCents : null,
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
  );
}

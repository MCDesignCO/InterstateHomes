import type { FastifyInstance } from 'fastify';
import { COST_CLASSIFICATIONS, COST_CODES } from '@interstate/shared';

export async function registerCostCodeRoutes(app: FastifyInstance) {
  app.get(
    '/api/cost-codes',
    {
      schema: {
        tags: ['Cost Codes'],
        summary: 'All 81 Section 7 cost codes grouped by 11 classifications',
      },
    },
    async () => ({
      classificationCount: COST_CLASSIFICATIONS.length,
      costCodeCount: COST_CODES.length,
      classifications: COST_CLASSIFICATIONS,
      costCodes: COST_CODES,
    })
  );
}

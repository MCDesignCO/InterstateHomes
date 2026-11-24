import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { COST_CLASSIFICATIONS, COST_CODES } from '@interstate/shared';
import { getDb } from '../db/client.js';
import { costClassifications, costCodes } from '../db/schema/index.js';
import { isUsingDemoStore } from '../security/auth-plugin.js';

export async function registerCostCodeRoutes(app: FastifyInstance) {
  app.get(
    '/api/cost-codes',
    {
      schema: {
        tags: ['Cost Codes'],
        summary: 'All 81 Section 7 cost codes grouped by 11 classifications',
      },
    },
    async () => {
      if (isUsingDemoStore()) {
        return {
          classificationCount: COST_CLASSIFICATIONS.length,
          costCodeCount: COST_CODES.length,
          classifications: COST_CLASSIFICATIONS,
          costCodes: COST_CODES,
        };
      }

      const db = getDb();
      const [clsRows, codeRows] = await Promise.all([
        db
          .select()
          .from(costClassifications)
          .orderBy(asc(costClassifications.sortOrder)),
        db
          .select()
          .from(costCodes)
          .where(eq(costCodes.active, true))
          .orderBy(asc(costCodes.sortOrder)),
      ]);

      const clsMap = new Map(clsRows.map((c) => [c.code, c.name]));

      const mappedCodes = codeRows.map((cc) => ({
        code: cc.code,
        name: cc.name,
        classificationCode: cc.classificationCode,
        classificationName: clsMap.get(cc.classificationCode) ?? cc.classificationCode,
        sortOrder: cc.sortOrder,
        estimateBuiltFrom: cc.estimateBuiltFrom,
        pricingSources: cc.pricingSourcesJson,
        isInternalOnly: cc.isInternalOnly,
        isEstimateable: cc.isEstimateable,
        requiresUtahLicense: cc.requiresUtahLicense,
        allowedSubLines: cc.allowedSubLinesJson,
      }));

      return {
        classificationCount: clsRows.length,
        costCodeCount: mappedCodes.length,
        classifications: clsRows,
        costCodes: mappedCodes,
      };
    }
  );
}

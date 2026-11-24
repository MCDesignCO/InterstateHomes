import type { FastifyInstance } from 'fastify';
import { isDatabaseConfigured, isDemoMode } from '../db/client.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(
    '/api/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Service health check',
      },
    },
    async () => ({
      ok: true,
      service: 'interstate-homes-api',
      mode: isDemoMode() || !isDatabaseConfigured() ? 'demo' : 'postgres',
      timestamp: new Date().toISOString(),
    })
  );
}

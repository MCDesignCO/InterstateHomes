import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { resolveRequestActor } from './security/auth-plugin.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerCostCodeRoutes } from './routes/cost-codes.js';
import { registerHomesRoutes } from './routes/homes.js';
import { registerSubcontractorRoutes } from './routes/subcontractors.js';
import { registerEstimateRoutes } from './routes/estimates.js';
import { registerQuoteRoutes } from './routes/quotes.js';
import { registerPurchaseOrderRoutes } from './routes/purchase-orders.js';
import { registerBudgetRoutes } from './routes/budgets.js';
import { registerClarificationRoutes } from './routes/clarifications.js';
import { registerAdminRoutes } from './routes/admin.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Interstate Homes Estimating, Subcontract & Budget API',
        version: '0.1.0',
        description:
          'Phase 1 backend API covering all 81 cost codes, plan intake, estimating, subcontractor portal & compliance, DocuSeal POs, budget build, and audit log.',
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.get('/openapi.json', async () => app.swagger());

  app.addHook('preHandler', async (request) => {
    request.actor = resolveRequestActor(request);
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerDashboardRoutes(app);
  await registerCostCodeRoutes(app);
  await registerHomesRoutes(app);
  await registerSubcontractorRoutes(app);
  await registerEstimateRoutes(app);
  await registerQuoteRoutes(app);
  await registerPurchaseOrderRoutes(app);
  await registerBudgetRoutes(app);
  await registerClarificationRoutes(app);
  await registerAdminRoutes(app);

  return app;
}

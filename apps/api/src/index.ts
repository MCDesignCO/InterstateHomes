import 'dotenv/config';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

async function start() {
  const app = await buildApp();
  await app.listen({ port, host });
  console.log(`Interstate Homes API listening on http://${host}:${port} (OpenAPI at /docs)`);
}

start().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});

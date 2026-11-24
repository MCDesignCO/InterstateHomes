import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb, isDatabaseConfigured } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  if (!isDatabaseConfigured()) {
    console.error('DATABASE_URL must be set to run database migrations.');
    process.exit(1);
  }
  const db = getDb();
  const migrationsFolder = path.resolve(__dirname, 'migrations');
  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied successfully.');
  await closeDb();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

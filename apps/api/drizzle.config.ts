import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './dist/db/schema/index.js',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/interstate_homes',
  },
});

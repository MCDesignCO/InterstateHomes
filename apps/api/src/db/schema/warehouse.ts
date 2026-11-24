import { pgSchema, uuid, text, integer, bigint, timestamp, date } from 'drizzle-orm/pg-core';

export const warehouseSchema = pgSchema('warehouse');

export const dimHomes = warehouseSchema.table('dim_homes', {
  homeId: uuid('home_id').primaryKey(),
  homeCode: text('home_code').notNull(),
  subdivisionCode: text('subdivision_code').notNull(),
  planName: text('plan_name').notNull(),
  finishedSqFt: integer('finished_sq_ft').notNull(),
  stage: text('stage').notNull(),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dimSubcontractors = warehouseSchema.table('dim_subcontractors', {
  subCompanyId: uuid('sub_company_id').primaryKey(),
  legalName: text('legal_name').notNull(),
  companyType: text('company_type').notNull(),
  status: text('status').notNull(),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const factEstimates = warehouseSchema.table('fact_estimates', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id').notNull(),
  estimateId: uuid('estimate_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  costCode: text('cost_code').notNull(),
  estimatedCents: bigint('estimated_cents', { mode: 'number' }).notNull(),
  snapshotDate: date('snapshot_date').notNull(),
});

export const factQuotes = warehouseSchema.table('fact_quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id').notNull(),
  homeId: uuid('home_id').notNull(),
  subCompanyId: uuid('sub_company_id').notNull(),
  costCode: text('cost_code').notNull(),
  status: text('status').notNull(),
  quotedTotalCents: bigint('quoted_total_cents', { mode: 'number' }).notNull(),
  snapshotDate: date('snapshot_date').notNull(),
});

export const factPurchaseOrders = warehouseSchema.table('fact_purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  poId: uuid('po_id').notNull(),
  poNumber: text('po_number').notNull(),
  homeId: uuid('home_id').notNull(),
  subCompanyId: uuid('sub_company_id').notNull(),
  costCode: text('cost_code').notNull(),
  poType: text('po_type').notNull(),
  totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
  status: text('status').notNull(),
  snapshotDate: date('snapshot_date').notNull(),
});

export const factBudgets = warehouseSchema.table('fact_budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id').notNull(),
  homeCode: text('home_code').notNull(),
  costCode: text('cost_code').notNull(),
  budgetCents: bigint('budget_cents', { mode: 'number' }).notNull(),
  estimateVersion: integer('estimate_version').notNull(),
  loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull(),
});

export const warehouseRefreshRuns = warehouseSchema.table('warehouse_refresh_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  triggerType: text('trigger_type').notNull(), // scheduled | manual
  status: text('status').notNull(), // running | succeeded | failed
  rowsWritten: integer('rows_written').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

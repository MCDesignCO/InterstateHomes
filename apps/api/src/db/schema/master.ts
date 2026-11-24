import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export const costClassifications = pgTable('cost_classifications', {
  code: text('code').primaryKey(), // e.g. "7.1" .. "7.11"
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const costCodes = pgTable('cost_codes', {
  code: text('code').primaryKey(), // Stored strictly as text ("00L", "03", "93")
  name: text('name').notNull(),
  classificationCode: text('classification_code')
    .notNull()
    .references(() => costClassifications.code),
  sortOrder: integer('sort_order').notNull(),
  estimateBuiltFrom: text('estimate_built_from').notNull(),
  pricingSourcesJson: jsonb('pricing_sources_json').$type<string[]>().notNull(),
  isInternalOnly: boolean('is_internal_only').notNull().default(false),
  isEstimateable: boolean('is_estimateable').notNull().default(true),
  requiresUtahLicense: boolean('requires_utah_license').notNull().default(false),
  allowedSubLinesJson: jsonb('allowed_sub_lines_json').$type<string[]>().notNull(),
  active: boolean('active').notNull().default(true),
});

export const subdivisions = pgTable('subdivisions', {
  code: text('code').primaryKey(), // e.g. CH, LK, NS, PS, ZV, SH
  name: text('name').notNull(),
  city: text('city').notNull(),
  jurisdiction: text('jurisdiction').notNull(),
  defaultHoaFeeCents: integer('default_hoa_fee_cents').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const planLibrary = pgTable('plan_library', {
  id: uuid('id').defaultRandom().primaryKey(),
  planName: text('plan_name').notNull().unique(),
  baseFinishedSqFt: integer('base_finished_sq_ft').notNull(),
  baseGarageSqFt: integer('base_garage_sq_ft').notNull().default(0),
  bedrooms: integer('bedrooms').notNull().default(3),
  baths: numeric('baths', { precision: 4, scale: 1 }).notNull().default('2.5'),
  stories: integer('stories').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planLibraryQuantities = pgTable('plan_library_quantities', {
  id: uuid('id').defaultRandom().primaryKey(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => planLibrary.id, { onDelete: 'cascade' }),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull().default('1'),
  unit: text('unit').notNull().default('LS'),
  sourceNote: text('source_note'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  bigint,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { planLibrary, subdivisions } from './master.js';

export const homes = pgTable('homes', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeCode: text('home_code').notNull().unique(), // e.g. "CH 14" matching job cost system
  subdivisionCode: text('subdivision_code')
    .notNull()
    .references(() => subdivisions.code),
  lot: text('lot').notNull(),
  address: text('address').notNull(),
  planId: uuid('plan_id').references(() => planLibrary.id),
  planName: text('plan_name').notNull(),
  elevation: text('elevation').notNull().default('Standard'),
  garageHanding: text('garage_handing').notNull().default('Right'),
  optionsJson: jsonb('options_json').$type<string[]>().notNull().default([]),
  finishedSqFt: integer('finished_sq_ft').notNull(),
  garageSqFt: integer('garage_sq_ft').notNull().default(0),
  bedrooms: integer('bedrooms').notNull().default(3),
  baths: numeric('baths', { precision: 4, scale: 1 }).notNull().default('2.5'),
  stories: integer('stories').notNull().default(1),
  plateHeightFt: numeric('plate_height_ft', { precision: 5, scale: 2 }).notNull().default('9'),
  roofPitch: text('roof_pitch').notNull().default('6:12'),
  exteriorFinishMix: text('exterior_finish_mix').notNull().default('Stucco + Stone'),
  stage: text('stage').notNull().default('plan_intake'), // plan_intake | estimating | quotes_out | pos_esign | live_budget
  soldAmountCents: bigint('sold_amount_cents', { mode: 'number' }), // Internal only
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const homePlanRevisions = pgTable('home_plan_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id')
    .notNull()
    .references(() => homes.id, { onDelete: 'cascade' }),
  revisionLabel: text('revision_label').notNull(), // e.g. "Rev 1"
  fileType: text('file_type').notNull(), // plan_set | specs | selections | engineering
  fileName: text('file_name').notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  storageKey: text('storage_key').notNull(),
  uploadedBy: uuid('uploaded_by'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

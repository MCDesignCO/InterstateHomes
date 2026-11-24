import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  bigint,
  timestamp,
  date,
  jsonb,
} from 'drizzle-orm/pg-core';
import { homes } from './homes.js';
import { costCodes } from './master.js';
import { subCompanies } from './subcontractors.js';

export const estimates = pgTable('estimates', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id')
    .notNull()
    .references(() => homes.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull().default(1),
  status: text('status').notNull().default('draft'), // draft | submitted | approved | superseded
  changeReason: text('change_reason'),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const estimateLines = pgTable('estimate_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  estimateId: uuid('estimate_id')
    .notNull()
    .references(() => estimates.id, { onDelete: 'cascade' }),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull().default('1'),
  unit: text('unit').notNull().default('LS'),
  quantitySource: text('quantity_source').notNull().default('manual'), // plan_library | manual | ai_takeoff
  pricingSource: text('pricing_source').notNull().default('sub'), // sub | supplier | fixed | allowance | none
  selectedSubId: uuid('selected_sub_id').references(() => subCompanies.id),
  unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull().default(0),
  extendedCents: bigint('extended_cents', { mode: 'number' }).notNull().default(0),
  isAllowanceOrFixed: boolean('is_allowance_or_fixed').notNull().default(false),
  showOnHomeownerPdf: boolean('show_on_homeowner_pdf').notNull().default(true),
  notes: text('notes'),
});

export const quotes = pgTable('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id')
    .notNull()
    .references(() => homes.id, { onDelete: 'cascade' }),
  estimateId: uuid('estimate_id')
    .notNull()
    .references(() => estimates.id),
  subCompanyId: uuid('sub_company_id')
    .notNull()
    .references(() => subCompanies.id),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  status: text('status').notNull().default('sent'), // sent | sub_adjusted | accepted | rejected | expired
  responseDeadline: date('response_deadline').notNull(),
  quotedTotalCents: bigint('quoted_total_cents', { mode: 'number' }).notNull(),
  snapshotJson: jsonb('snapshot_json').$type<Record<string, unknown>>().notNull(), // Immutable snapshot of qty & prices on send
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const quoteRounds = pgTable('quote_rounds', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  roundNumber: integer('round_number').notNull(),
  actorType: text('actor_type').notNull(), // estimator | subcontractor
  actorUserId: uuid('actor_user_id'),
  proposedTotalCents: bigint('proposed_total_cents', { mode: 'number' }).notNull(),
  proposedQuantity: numeric('proposed_quantity', { precision: 14, scale: 3 }),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  poNumber: text('po_number').notNull().unique(), // e.g. CH14-31-01
  homeId: uuid('home_id')
    .notNull()
    .references(() => homes.id, { onDelete: 'cascade' }),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  subCompanyId: uuid('sub_company_id')
    .notNull()
    .references(() => subCompanies.id),
  quoteId: uuid('quote_id').references(() => quotes.id),
  poType: text('po_type').notNull(), // subcontractor | supplier
  scopeSummary: text('scope_summary').notNull(),
  planRevision: text('plan_revision').notNull().default('Rev 1'),
  totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
  masterAgreementRef: text('master_agreement_ref'),
  splitScopeOverrideBy: uuid('split_scope_override_by'),
  splitScopeOverrideReason: text('split_scope_override_reason'),
  status: text('status').notNull().default('pending_sub_signature'), // pending_sub_signature | pending_approver_signature | fully_signed | voided
  docusealSubmissionId: text('docuseal_submission_id'),
  subSignedAt: timestamp('sub_signed_at', { withTimezone: true }),
  approverSignedAt: timestamp('approver_signed_at', { withTimezone: true }),
  signedPdfStorageKey: text('signed_pdf_storage_key'),
  certificateStorageKey: text('certificate_storage_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const homeBudgetFixedLines = pgTable('home_budget_fixed_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id')
    .notNull()
    .references(() => homes.id, { onDelete: 'cascade' }),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  note: text('note'),
  enteredBy: uuid('entered_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Live job cost budget table matching SOW Section 11 exact columns. */
export const jobCostBudgets = pgTable('job_cost_budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id')
    .notNull()
    .references(() => homes.id, { onDelete: 'cascade' }),
  homeCode: text('home_code').notNull(), // Column: Home (e.g. CH 14)
  costCode: text('cost_code').notNull(), // Column: Code (as text)
  costCodeName: text('cost_code_name').notNull(), // Column: Name
  budgetCents: bigint('budget_cents', { mode: 'number' }).notNull(), // Column: Budget
  source: text('source').notNull(), // Column: Source ("Estimating system v1")
  loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull().defaultNow(), // Column: Loaded
  estimateVersion: integer('estimate_version').notNull(),
});

export const clarificationItems = pgTable('clarification_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  homeId: uuid('home_id')
    .notNull()
    .references(() => homes.id, { onDelete: 'cascade' }),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  category: text('category').notNull(), // question | scope_gap | plan_conflict | price_dispute
  title: text('title').notNull(),
  status: text('status').notNull().default('open'), // open | answered | closed
  ownerUserId: uuid('owner_user_id'),
  dueDate: date('due_date'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clarificationMessages = pgTable('clarification_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  clarificationId: uuid('clarification_id')
    .notNull()
    .references(() => clarificationItems.id, { onDelete: 'cascade' }),
  authorUserId: uuid('author_user_id'),
  body: text('body').notNull(),
  attachmentStorageKey: text('attachment_storage_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailLogs = pgTable('email_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  templateName: text('template_name').notNull(),
  relatedEntityType: text('related_entity_type'),
  relatedEntityId: text('related_entity_id'),
  triggeredByUserId: uuid('triggered_by_user_id'),
  status: text('status').notNull().default('sent'),
  providerMessageId: text('provider_message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

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
import { costCodes, subdivisions } from './master.js';

export const subCompanies = pgTable('sub_companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  legalName: text('legal_name').notNull(),
  dbaName: text('dba_name'),
  companyType: text('company_type').notNull(), // subcontractor | supplier | both
  address: text('address'),
  mainPhone: text('main_phone'),
  website: text('website'),
  hasVehiclesOnSite: boolean('has_vehicles_on_site').notNull().default(true),
  status: text('status').notNull().default('active'), // active | on_hold | inactive
  statusReason: text('status_reason'),
  utahLicenseNumber: text('utah_license_number'),
  utahLicenseClass: text('utah_license_class'),
  utahLicenseExpiry: date('utah_license_expiry'),
  businessLicenseJurisdiction: text('business_license_jurisdiction'),
  businessLicenseExpiry: date('business_license_expiry'),
  paymentTermsNetDays: integer('payment_terms_net_days').notNull().default(30),
  retainagePercent: numeric('retainage_percent', { precision: 5, scale: 2 }).notNull().default('0'),
  performanceNotesInternal: text('performance_notes_internal'), // Internal only, never visible to sub
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subContacts = pgTable('sub_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  subCompanyId: uuid('sub_company_id')
    .notNull()
    .references(() => subCompanies.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  roleTitle: text('role_title').notNull(),
  email: text('email').notNull(),
  mobile: text('mobile'),
  isSigner: boolean('is_signer').notNull().default(false),
  userId: uuid('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subCostCodes = pgTable('sub_cost_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  subCompanyId: uuid('sub_company_id')
    .notNull()
    .references(() => subCompanies.id, { onDelete: 'cascade' }),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  subdivisionCode: text('subdivision_code').references(() => subdivisions.code), // null = all subdivisions
  isPreferred: boolean('is_preferred').notNull().default(false),
});

export const complianceDocuments = pgTable('compliance_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  subCompanyId: uuid('sub_company_id')
    .notNull()
    .references(() => subCompanies.id, { onDelete: 'cascade' }),
  docType: text('doc_type').notNull(), // coi_gl | auto_liability | workers_comp | w9 | utah_license | business_license | master_agreement
  storageKey: text('storage_key').notNull(),
  fileName: text('file_name').notNull(),
  carrier: text('carrier'),
  policyOrLicenseNumber: text('policy_or_license_number'),
  limitAmountCents: bigint('limit_amount_cents', { mode: 'number' }),
  additionalInsured: boolean('additional_insured').default(false),
  licenseClassification: text('license_classification'),
  agreementVersion: text('agreement_version'),
  entityType: text('entity_type'), // For W-9
  w9TinEncrypted: text('w9_tin_encrypted'), // AES-256-GCM encrypted
  w9TinLast4: text('w9_tin_last4'),
  expiresAt: date('expires_at'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  reviewStatus: text('review_status').notNull().default('pending'), // pending | approved | rejected
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  aiExtractedJson: jsonb('ai_extracted_json').$type<Record<string, unknown> | null>(),
});

export const priceSheets = pgTable('price_sheets', {
  id: uuid('id').defaultRandom().primaryKey(),
  subCompanyId: uuid('sub_company_id')
    .notNull()
    .references(() => subCompanies.id, { onDelete: 'cascade' }),
  costCode: text('cost_code')
    .notNull()
    .references(() => costCodes.code),
  subdivisionScope: text('subdivision_scope').notNull().default('ALL'),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  minimumChargeCents: bigint('minimum_charge_cents', { mode: 'number' }),
  inclusionsExclusions: text('inclusions_exclusions'),
  pdfStorageKey: text('pdf_storage_key'),
  updatedByUserId: uuid('updated_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const priceSheetItems = pgTable('price_sheet_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  priceSheetId: uuid('price_sheet_id')
    .notNull()
    .references(() => priceSheets.id, { onDelete: 'cascade' }),
  subLineName: text('sub_line_name').notNull(),
  unit: text('unit').notNull(),
  unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
  notes: text('notes'),
});

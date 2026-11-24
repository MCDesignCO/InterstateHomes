CREATE SCHEMA "warehouse";
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"home_id" uuid,
	"ip_address" text,
	"before_values" jsonb,
	"after_values" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reauth_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"min_password_length" integer DEFAULT 12 NOT NULL,
	"session_timeout_minutes" integer DEFAULT 30 NOT NULL,
	"inactive_disable_days" integer DEFAULT 90 NOT NULL,
	"audit_retention_years" integer DEFAULT 7 NOT NULL,
	"breach_notice_hours" integer DEFAULT 24 NOT NULL,
	"max_plan_upload_mb" integer DEFAULT 250 NOT NULL,
	"warehouse_refresh_schedule" text DEFAULT '0 2 * * *' NOT NULL,
	"coi_reminder_days_json" jsonb DEFAULT '[30,15,0]'::jsonb NOT NULL,
	"require_master_agreement" boolean DEFAULT true NOT NULL,
	"current_master_agreement_version" text DEFAULT '2026.1' NOT NULL,
	"default_gl_min_limit_cents" bigint DEFAULT 100000000 NOT NULL,
	"default_auto_min_limit_cents" bigint DEFAULT 100000000 NOT NULL,
	"po_number_format" text DEFAULT '{subdivisionCode}{lot}-{costCode}-{seq}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"sub_company_id" uuid,
	"is_sub_company_admin" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"mfa_secret_encrypted" text,
	"mfa_enabled" boolean DEFAULT true NOT NULL,
	"approval_limit_cents" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cost_classifications" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"classification_code" text NOT NULL,
	"sort_order" integer NOT NULL,
	"estimate_built_from" text NOT NULL,
	"pricing_sources_json" jsonb NOT NULL,
	"is_internal_only" boolean DEFAULT false NOT NULL,
	"is_estimateable" boolean DEFAULT true NOT NULL,
	"requires_utah_license" boolean DEFAULT false NOT NULL,
	"allowed_sub_lines_json" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_name" text NOT NULL,
	"base_finished_sq_ft" integer NOT NULL,
	"base_garage_sq_ft" integer DEFAULT 0 NOT NULL,
	"bedrooms" integer DEFAULT 3 NOT NULL,
	"baths" numeric(4, 1) DEFAULT '2.5' NOT NULL,
	"stories" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_library_plan_name_unique" UNIQUE("plan_name")
);
--> statement-breakpoint
CREATE TABLE "plan_library_quantities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'LS' NOT NULL,
	"source_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subdivisions" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"default_hoa_fee_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_plan_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"revision_label" text NOT NULL,
	"file_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_code" text NOT NULL,
	"subdivision_code" text NOT NULL,
	"lot" text NOT NULL,
	"address" text NOT NULL,
	"plan_id" uuid,
	"plan_name" text NOT NULL,
	"elevation" text DEFAULT 'Standard' NOT NULL,
	"garage_handing" text DEFAULT 'Right' NOT NULL,
	"options_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finished_sq_ft" integer NOT NULL,
	"garage_sq_ft" integer DEFAULT 0 NOT NULL,
	"bedrooms" integer DEFAULT 3 NOT NULL,
	"baths" numeric(4, 1) DEFAULT '2.5' NOT NULL,
	"stories" integer DEFAULT 1 NOT NULL,
	"plate_height_ft" numeric(5, 2) DEFAULT '9' NOT NULL,
	"roof_pitch" text DEFAULT '6:12' NOT NULL,
	"exterior_finish_mix" text DEFAULT 'Stucco + Stone' NOT NULL,
	"stage" text DEFAULT 'plan_intake' NOT NULL,
	"sold_amount_cents" bigint,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homes_home_code_unique" UNIQUE("home_code")
);
--> statement-breakpoint
CREATE TABLE "compliance_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"carrier" text,
	"policy_or_license_number" text,
	"limit_amount_cents" bigint,
	"additional_insured" boolean DEFAULT false,
	"license_classification" text,
	"agreement_version" text,
	"entity_type" text,
	"w9_tin_encrypted" text,
	"w9_tin_last4" text,
	"expires_at" date,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"ai_extracted_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "price_sheet_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_sheet_id" uuid NOT NULL,
	"sub_line_name" text NOT NULL,
	"unit" text NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "price_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"subdivision_scope" text DEFAULT 'ALL' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"minimum_charge_cents" bigint,
	"inclusions_exclusions" text,
	"pdf_storage_key" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"dba_name" text,
	"company_type" text NOT NULL,
	"address" text,
	"main_phone" text,
	"website" text,
	"has_vehicles_on_site" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"utah_license_number" text,
	"utah_license_class" text,
	"utah_license_expiry" date,
	"business_license_jurisdiction" text,
	"business_license_expiry" date,
	"payment_terms_net_days" integer DEFAULT 30 NOT NULL,
	"retainage_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"performance_notes_internal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"role_title" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text,
	"is_signer" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_cost_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"subdivision_code" text,
	"is_preferred" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarification_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_user_id" uuid,
	"due_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarification_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clarification_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"attachment_storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"template_name" text NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"triggered_by_user_id" uuid,
	"status" text DEFAULT 'sent' NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'LS' NOT NULL,
	"quantity_source" text DEFAULT 'manual' NOT NULL,
	"pricing_source" text DEFAULT 'sub' NOT NULL,
	"selected_sub_id" uuid,
	"unit_price_cents" bigint DEFAULT 0 NOT NULL,
	"extended_cents" bigint DEFAULT 0 NOT NULL,
	"is_allowance_or_fixed" boolean DEFAULT false NOT NULL,
	"show_on_homeowner_pdf" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"change_reason" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_budget_fixed_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" text,
	"entered_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_cost_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"home_code" text NOT NULL,
	"cost_code" text NOT NULL,
	"cost_code_name" text NOT NULL,
	"budget_cents" bigint NOT NULL,
	"source" text NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"estimate_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" text NOT NULL,
	"home_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"quote_id" uuid,
	"po_type" text NOT NULL,
	"scope_summary" text NOT NULL,
	"plan_revision" text DEFAULT 'Rev 1' NOT NULL,
	"total_cents" bigint NOT NULL,
	"master_agreement_ref" text,
	"split_scope_override_by" uuid,
	"split_scope_override_reason" text,
	"status" text DEFAULT 'pending_sub_signature' NOT NULL,
	"docuseal_submission_id" text,
	"sub_signed_at" timestamp with time zone,
	"approver_signed_at" timestamp with time zone,
	"signed_pdf_storage_key" text,
	"certificate_storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "quote_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"proposed_total_cents" bigint NOT NULL,
	"proposed_quantity" numeric(14, 3),
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"response_deadline" date NOT NULL,
	"quoted_total_cents" bigint NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse"."dim_homes" (
	"home_id" uuid PRIMARY KEY NOT NULL,
	"home_code" text NOT NULL,
	"subdivision_code" text NOT NULL,
	"plan_name" text NOT NULL,
	"finished_sq_ft" integer NOT NULL,
	"stage" text NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse"."dim_subcontractors" (
	"sub_company_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"company_type" text NOT NULL,
	"status" text NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse"."fact_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"home_code" text NOT NULL,
	"cost_code" text NOT NULL,
	"budget_cents" bigint NOT NULL,
	"estimate_version" integer NOT NULL,
	"loaded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse"."fact_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"cost_code" text NOT NULL,
	"estimated_cents" bigint NOT NULL,
	"snapshot_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse"."fact_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"po_number" text NOT NULL,
	"home_id" uuid NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"po_type" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"status" text NOT NULL,
	"snapshot_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse"."fact_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"sub_company_id" uuid NOT NULL,
	"cost_code" text NOT NULL,
	"status" text NOT NULL,
	"quoted_total_cents" bigint NOT NULL,
	"snapshot_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse"."warehouse_refresh_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_type" text NOT NULL,
	"status" text NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_classification_code_cost_classifications_code_fk" FOREIGN KEY ("classification_code") REFERENCES "public"."cost_classifications"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_library_quantities" ADD CONSTRAINT "plan_library_quantities_plan_id_plan_library_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_library_quantities" ADD CONSTRAINT "plan_library_quantities_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_plan_revisions" ADD CONSTRAINT "home_plan_revisions_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_subdivision_code_subdivisions_code_fk" FOREIGN KEY ("subdivision_code") REFERENCES "public"."subdivisions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_plan_id_plan_library_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan_library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sheet_items" ADD CONSTRAINT "price_sheet_items_price_sheet_id_price_sheets_id_fk" FOREIGN KEY ("price_sheet_id") REFERENCES "public"."price_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sheets" ADD CONSTRAINT "price_sheets_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sheets" ADD CONSTRAINT "price_sheets_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_contacts" ADD CONSTRAINT "sub_contacts_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_cost_codes" ADD CONSTRAINT "sub_cost_codes_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_cost_codes" ADD CONSTRAINT "sub_cost_codes_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_cost_codes" ADD CONSTRAINT "sub_cost_codes_subdivision_code_subdivisions_code_fk" FOREIGN KEY ("subdivision_code") REFERENCES "public"."subdivisions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarification_items" ADD CONSTRAINT "clarification_items_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarification_items" ADD CONSTRAINT "clarification_items_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarification_messages" ADD CONSTRAINT "clarification_messages_clarification_id_clarification_items_id_fk" FOREIGN KEY ("clarification_id") REFERENCES "public"."clarification_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_selected_sub_id_sub_companies_id_fk" FOREIGN KEY ("selected_sub_id") REFERENCES "public"."sub_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_budget_fixed_lines" ADD CONSTRAINT "home_budget_fixed_lines_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_budget_fixed_lines" ADD CONSTRAINT "home_budget_fixed_lines_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cost_budgets" ADD CONSTRAINT "job_cost_budgets_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_rounds" ADD CONSTRAINT "quote_rounds_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sub_company_id_sub_companies_id_fk" FOREIGN KEY ("sub_company_id") REFERENCES "public"."sub_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_cost_code_cost_codes_code_fk" FOREIGN KEY ("cost_code") REFERENCES "public"."cost_codes"("code") ON DELETE no action ON UPDATE no action;
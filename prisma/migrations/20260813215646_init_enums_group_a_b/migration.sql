-- CreateEnum
CREATE TYPE "role_group" AS ENUM ('system', 'inhouse', 'outsource', 'finance_company');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "team_side" AS ENUM ('inhouse', 'outsource');

-- CreateEnum
CREATE TYPE "team_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "payee_type" AS ENUM ('individual', 'corporate');

-- CreateEnum
CREATE TYPE "cycle_type" AS ENUM ('AR', 'AP');

-- CreateEnum
CREATE TYPE "cutoff_rule_type" AS ENUM ('fixed_dates', 'month_end', 'custom_text');

-- CreateEnum
CREATE TYPE "bank_account_usage" AS ENUM ('receive', 'pay', 'both');

-- CreateEnum
CREATE TYPE "bank_file_type" AS ENUM ('CSV', 'TXT');

-- CreateEnum
CREATE TYPE "bank_file_encoding" AS ENUM ('UTF-8', 'TIS-620');

-- CreateEnum
CREATE TYPE "bank_file_test_status" AS ENUM ('pending', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "invoice_numbering_mode" AS ENUM ('continuous', 'yearly_reset');

-- CreateEnum
CREATE TYPE "tax_document_type" AS ENUM ('tax_invoice', 'wht_certificate');

-- CreateEnum
CREATE TYPE "tax_doc_paper_size" AS ENUM ('A4', 'A5');

-- CreateEnum
CREATE TYPE "tax_doc_language" AS ENUM ('th', 'th_en_bilingual');

-- CreateEnum
CREATE TYPE "functional_group" AS ENUM ('ops', 'finance', 'accounting', 'admin');

-- CreateEnum
CREATE TYPE "capability_access_level" AS ENUM ('view', 'manage');

-- CreateEnum
CREATE TYPE "fuel_mode" AS ENUM ('PER_KM', 'DAILY_FLAT');

-- CreateEnum
CREATE TYPE "service_fee_model" AS ENUM ('SUCCESS_FEE', 'FLAT', 'HYBRID');

-- CreateEnum
CREATE TYPE "service_fee_basis" AS ENUM ('debt_amount', 'asset_value');

-- CreateEnum
CREATE TYPE "vat_mode" AS ENUM ('include_vat', 'exclude_vat', 'no_vat');

-- CreateEnum
CREATE TYPE "company_user_level" AS ENUM ('manager', 'supervisor', 'admin');

-- CreateEnum
CREATE TYPE "due_rule_type" AS ENUM ('net_days', 'day_of_next_month', 'month_end');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('draft', 'pending_review', 'need_info', 'approved', 'rejected', 'active', 'closed_success', 'closed_fail', 'pending_recycle_review');

-- CreateEnum
CREATE TYPE "case_source" AS ENUM ('manual', 'import', 'api');

-- CreateEnum
CREATE TYPE "recycle_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('pending', 'accepted', 'active', 'completed', 'reassigned', 'cancelled');

-- CreateEnum
CREATE TYPE "checkin_type" AS ENUM ('address', 'contact', 'workplace', 'asset_location');

-- CreateEnum
CREATE TYPE "case_outcome" AS ENUM ('closed_success', 'closed_fail');

-- CreateEnum
CREATE TYPE "evidence_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('pending_intake', 'intake_rejected', 'in_custody', 'handover_pending', 'handed_over');

-- CreateEnum
CREATE TYPE "asset_condition" AS ENUM ('normal', 'damaged', 'partial_loss');

-- CreateEnum
CREATE TYPE "handover_type" AS ENUM ('finance_pickup', 'we_deliver');

-- CreateEnum
CREATE TYPE "handover_lot_status" AS ENUM ('pending_attach', 'pending_delivery_proof', 'confirmed');

-- CreateEnum
CREATE TYPE "expense_status" AS ENUM ('pending_warehouse_confirm', 'pending_approval', 'pending_finance_approval', 'approved', 'rejected', 'needs_revision', 'superseded');

-- CreateEnum
CREATE TYPE "expense_type" AS ENUM ('fuel', 'allowance', 'commission', 'no_success_fee', 'hotel', 'receipt', 'manual');

-- CreateEnum
CREATE TYPE "advance_status" AS ENUM ('pending_approval', 'approved', 'cleared', 'overdue', 'rejected');

-- CreateEnum
CREATE TYPE "payout_batch_side" AS ENUM ('inhouse', 'outsource');

-- CreateEnum
CREATE TYPE "payout_batch_status" AS ENUM ('draft', 'checking', 'file_generated', 'completed');

-- CreateEnum
CREATE TYPE "revenue_status" AS ENUM ('ready_for_billing', 'billed');

-- CreateEnum
CREATE TYPE "billing_batch_status" AS ENUM ('draft', 'sent', 'partially_paid', 'paid');

-- CreateEnum
CREATE TYPE "adjustment_type" AS ENUM ('increase', 'decrease');

-- CreateEnum
CREATE TYPE "adjustment_status" AS ENUM ('pending_approval', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "accounting_period_status" AS ENUM ('collecting', 'sent_to_accountant', 'locked');

-- CreateEnum
CREATE TYPE "exception_level" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "exception_status" AS ENUM ('open', 'resolved', 'authorized');

-- CreateEnum
CREATE TYPE "bank_match_status" AS ENUM ('unmatched', 'auto_matched', 'manual_matched', 'unmatched_resolved');

-- CreateEnum
CREATE TYPE "tax_invoice_status" AS ENUM ('active', 'cancelled');

-- CreateEnum
CREATE TYPE "wht_filing_form" AS ENUM ('PND3', 'PND53');

-- CreateEnum
CREATE TYPE "wht_filing_status" AS ENUM ('pending', 'filed');

-- CreateEnum
CREATE TYPE "wht_certificate_status" AS ENUM ('active', 'cancelled');

-- CreateEnum
CREATE TYPE "wht_delivery_format" AS ENUM ('paper', 'e_withholding');

-- CreateEnum
CREATE TYPE "export_record_status" AS ENUM ('generated', 'sent', 'accepted');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('create', 'update', 'delete', 'status_change', 'approve', 'reject', 'confirm', 'lock', 'unlock', 'export', 'import', 'login', 'logout');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "tax_id" VARCHAR(13) NOT NULL,
    "address" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "logo_url" TEXT,
    "vat_registered" BOOLEAN NOT NULL DEFAULT true,
    "tax_invoice_prefix" VARCHAR(20) NOT NULL DEFAULT 'INV',
    "tax_invoice_seq" INTEGER NOT NULL DEFAULT 0,
    "tax_invoice_numbering_mode" "invoice_numbering_mode" NOT NULL DEFAULT 'continuous',
    "tax_invoice_digit_length" INTEGER NOT NULL DEFAULT 4,
    "tax_invoice_last_reset_year" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role_group" "role_group" NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "is_editable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "supabase_uid" UUID,
    "email" VARCHAR(255) NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "employee_code" VARCHAR(50),
    "team_id" UUID,
    "company_id" UUID,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "functional_group" "functional_group",
    "description" TEXT,

    CONSTRAINT "capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_capabilities" (
    "role_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "access_level" "capability_access_level" NOT NULL DEFAULT 'manage',

    CONSTRAINT "role_capabilities_pkey" PRIMARY KEY ("role_id","capability_id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "side" "team_side" NOT NULL,
    "compensation_plan_id" UUID,
    "supervisor_id" UUID,
    "provinces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "team_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_managers" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "team_managers_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "compensation_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "side" "team_side" NOT NULL,
    "fuel_mode" "fuel_mode" NOT NULL,
    "fuel_rate_per_km_satang" INTEGER,
    "fuel_max_per_case_satang" INTEGER,
    "fuel_daily_flat_satang" INTEGER,
    "allowance_satang" INTEGER NOT NULL DEFAULT 0,
    "commission_satang" INTEGER NOT NULL DEFAULT 0,
    "no_success_fee_satang" INTEGER NOT NULL DEFAULT 0,
    "hotel_max_per_night_satang" INTEGER,
    "hotel_receipt_required" BOOLEAN NOT NULL DEFAULT true,
    "wht_pct" DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "compensation_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "tax_id" VARCHAR(13) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "contact_name" TEXT,
    "contact_phone" VARCHAR(20),
    "signer_name" TEXT,
    "service_fee_template_id" UUID,
    "vat_mode" "vat_mode" NOT NULL DEFAULT 'exclude_vat',
    "vat_registered" BOOLEAN NOT NULL DEFAULT true,
    "billing_day" INTEGER NOT NULL DEFAULT 1,
    "payment_due_days" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'active',
    "wht_withheld_by_customer_pct" DECIMAL(5,2) DEFAULT 3.00,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "finance_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_fee_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "model" "service_fee_model" NOT NULL,
    "base_satang" INTEGER NOT NULL DEFAULT 0,
    "rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "basis" "service_fee_basis",
    "charge_on_fail" BOOLEAN NOT NULL DEFAULT false,
    "charge_per_tracking_round" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "service_fee_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "wht_pct" DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    "wht_basis" TEXT NOT NULL DEFAULT 'before_vat',
    "wht_min_threshold_satang" INTEGER NOT NULL DEFAULT 100000,
    "income_type" TEXT NOT NULL DEFAULT 'ค่าจ้างทำของ มาตรา 40(8)',
    "filing_form" "wht_filing_form" NOT NULL DEFAULT 'PND3',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_rate_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rate_pct" DECIMAL(5,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "vat_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_type" TEXT NOT NULL DEFAULT 'savings',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "usage" "bank_account_usage" NOT NULL DEFAULT 'both',
    "statement_format" TEXT,
    "payment_file_format" TEXT,
    "auto_match_tolerance_days" INTEGER NOT NULL DEFAULT 7,
    "is_payout_account" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_payout_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "cycle_type" NOT NULL,
    "cutoff_rule_type" "cutoff_rule_type" NOT NULL,
    "cutoff_dates" INTEGER[],
    "cutoff_text" TEXT,
    "due_rule_type" "due_rule_type" NOT NULL DEFAULT 'net_days',
    "due_rule_value" INTEGER,
    "due_rule" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "billing_payout_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_matrices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "condition" TEXT NOT NULL,
    "condition_threshold_satang" INTEGER,
    "approval_flow" TEXT[],
    "enforce_segregation_of_duties" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_policy_settings" (
    "organization_id" UUID NOT NULL,
    "advance_max_amount_per_request_satang" INTEGER,
    "require_payee_id_document" BOOLEAN NOT NULL DEFAULT false,
    "ar_aging_buckets" INTEGER[] DEFAULT ARRAY[30, 60, 90]::INTEGER[],
    "write_off_tolerance_satang" INTEGER NOT NULL DEFAULT 5000,
    "advance_uncleared_to_employee_receivable" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "finance_policy_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "bank_file_formats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "file_type" "bank_file_type" NOT NULL,
    "encoding" "bank_file_encoding" NOT NULL,
    "column_mapping" TEXT NOT NULL,
    "test_status" "bank_file_test_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "bank_file_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_document_template_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "document_type" "tax_document_type" NOT NULL,
    "logo_url" TEXT,
    "footer_note" TEXT,
    "signature_image_url" TEXT,
    "paper_size" "tax_doc_paper_size" NOT NULL DEFAULT 'A4',
    "language" "tax_doc_language" NOT NULL DEFAULT 'th',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "tax_document_template_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tax_id_key" ON "organizations"("tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_name_role_group_key" ON "roles"("organization_id", "name", "role_group");

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_uid_key" ON "users"("supabase_uid");

-- CreateIndex
CREATE INDEX "idx_users_org_role" ON "users"("organization_id", "role_id");

-- CreateIndex
CREATE INDEX "idx_users_org_team" ON "users"("organization_id", "team_id");

-- CreateIndex
CREATE INDEX "idx_users_org_company" ON "users"("organization_id", "company_id");

-- CreateIndex
CREATE INDEX "idx_users_supabase" ON "users"("supabase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "capabilities_code_key" ON "capabilities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organization_id_name_key" ON "teams"("organization_id", "name");

-- CreateIndex
CREATE INDEX "idx_comp_plans_org" ON "compensation_plans"("organization_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "compensation_plans_organization_id_name_version_key" ON "compensation_plans"("organization_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "finance_companies_organization_id_tax_id_key" ON "finance_companies"("organization_id", "tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_fee_templates_organization_id_name_version_key" ON "service_fee_templates"("organization_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "tax_profiles_organization_id_name_key" ON "tax_profiles"("organization_id", "name");

-- CreateIndex
CREATE INDEX "idx_vat_rates_org_date" ON "vat_rate_history"("organization_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_organization_id_account_number_key" ON "bank_accounts"("organization_id", "account_number");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_organization_id_code_key" ON "cost_centers"("organization_id", "code");

-- CreateIndex
CREATE INDEX "idx_cycles_org" ON "billing_payout_cycles"("organization_id", "type");

-- CreateIndex
CREATE INDEX "idx_approval_matrices_org" ON "approval_matrices"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_document_template_settings_organization_id_document_typ_key" ON "tax_document_template_settings"("organization_id", "document_type");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_capabilities" ADD CONSTRAINT "role_capabilities_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_capabilities" ADD CONSTRAINT "role_capabilities_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_compensation_plan_id_fkey" FOREIGN KEY ("compensation_plan_id") REFERENCES "compensation_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_managers" ADD CONSTRAINT "team_managers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_managers" ADD CONSTRAINT "team_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_plans" ADD CONSTRAINT "compensation_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_plans" ADD CONSTRAINT "compensation_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_plans" ADD CONSTRAINT "compensation_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_companies" ADD CONSTRAINT "finance_companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_companies" ADD CONSTRAINT "finance_companies_service_fee_template_id_fkey" FOREIGN KEY ("service_fee_template_id") REFERENCES "service_fee_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_companies" ADD CONSTRAINT "finance_companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_companies" ADD CONSTRAINT "finance_companies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_fee_templates" ADD CONSTRAINT "service_fee_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_fee_templates" ADD CONSTRAINT "service_fee_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_fee_templates" ADD CONSTRAINT "service_fee_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_rate_history" ADD CONSTRAINT "vat_rate_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_rate_history" ADD CONSTRAINT "vat_rate_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payout_cycles" ADD CONSTRAINT "billing_payout_cycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payout_cycles" ADD CONSTRAINT "billing_payout_cycles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payout_cycles" ADD CONSTRAINT "billing_payout_cycles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrices" ADD CONSTRAINT "approval_matrices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrices" ADD CONSTRAINT "approval_matrices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_matrices" ADD CONSTRAINT "approval_matrices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_policy_settings" ADD CONSTRAINT "finance_policy_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_policy_settings" ADD CONSTRAINT "finance_policy_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_file_formats" ADD CONSTRAINT "bank_file_formats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_file_formats" ADD CONSTRAINT "bank_file_formats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_file_formats" ADD CONSTRAINT "bank_file_formats_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_document_template_settings" ADD CONSTRAINT "tax_document_template_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_document_template_settings" ADD CONSTRAINT "tax_document_template_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- ส่วนที่ Prisma ไม่รองรับ ต้องเขียน raw SQL เอง (`.claude/rules/02-database.md`)
-- ═══════════════════════════════════════════════════════════════

-- ── CHECK: cycles_cutoff_shape (`02` §5 L654) ────────────────────────────────
-- รูปแบบ cutoff ต้องมีข้อมูลครบตามชนิดที่เลือก ไม่งั้นคำนวณรอบบิล/รอบจ่ายไม่ได้
ALTER TABLE "billing_payout_cycles"
  ADD CONSTRAINT "cycles_cutoff_shape" CHECK (
    ("cutoff_rule_type" = 'fixed_dates' AND "cutoff_dates" IS NOT NULL AND array_length("cutoff_dates", 1) > 0) OR
    ("cutoff_rule_type" = 'custom_text' AND "cutoff_text" IS NOT NULL) OR
    ("cutoff_rule_type" = 'month_end')
  );

-- ── CHECK: due_rule_shape (A5 — มติ PO 2026-08-12) ───────────────────────────
-- net_days / day_of_next_month ต้องมีตัวเลขเสมอ ไม่งั้น due_date คำนวณไม่ได้
ALTER TABLE "billing_payout_cycles"
  ADD CONSTRAINT "cycles_due_rule_shape" CHECK (
    ("due_rule_type" IN ('net_days', 'day_of_next_month') AND "due_rule_value" IS NOT NULL AND "due_rule_value" > 0) OR
    ("due_rule_type" = 'month_end')
  );

-- ── Circular FK: users ↔ teams ↔ organizations (`02` §11 L1603) ──────────────
-- seed/สร้างข้อมูลชุดแรกต้องทำใน transaction เดียว (org → user → team แล้วผูกกลับ)
-- ⇒ FK ที่ปิดวงต้องเป็น DEFERRABLE INITIALLY DEFERRED ไม่งั้น insert ไม่ได้เลยไม่ว่าจะเรียงลำดับยังไง
-- ⚠️ Prisma ไม่มีไวยากรณ์สำหรับ DEFERRABLE — ถ้า generate migration ใหม่ทับตารางเหล่านี้ ต้องเติมบล็อกนี้ซ้ำ
ALTER TABLE "users" DROP CONSTRAINT "users_team_id_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "users" DROP CONSTRAINT "users_created_by_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "users" DROP CONSTRAINT "users_updated_by_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "teams" DROP CONSTRAINT "teams_supervisor_id_fkey";
ALTER TABLE "teams" ADD CONSTRAINT "teams_supervisor_id_fkey"
  FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "teams" DROP CONSTRAINT "teams_created_by_fkey";
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "teams" DROP CONSTRAINT "teams_updated_by_fkey";
ALTER TABLE "teams" ADD CONSTRAINT "teams_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- AlterTable
ALTER TABLE "approval_matrices" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bank_accounts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bank_file_formats" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "billing_payout_cycles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "compensation_plans" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "cost_centers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "finance_companies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "finance_policy_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_fee_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tax_document_template_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tax_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "teams" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_ref" TEXT NOT NULL,
    "tracking_round" INTEGER NOT NULL DEFAULT 1,
    "source" "case_source" NOT NULL DEFAULT 'manual',
    "status" "case_status" NOT NULL DEFAULT 'draft',
    "company_id" UUID NOT NULL,
    "service_fee_template_id" UUID,
    "service_fee_model_snapshot" "service_fee_model",
    "service_fee_base_satang" INTEGER,
    "service_fee_rate_pct" DECIMAL(5,2),
    "service_fee_basis_snapshot" "service_fee_basis",
    "service_fee_charge_on_fail" BOOLEAN,
    "debtor_name" TEXT NOT NULL,
    "debtor_national_id" VARCHAR(13),
    "debtor_phone_mobile" VARCHAR(20),
    "debtor_phone_work" VARCHAR(20),
    "debtor_line_id" TEXT,
    "debtor_facebook" TEXT,
    "addr_province" TEXT,
    "addr_district" TEXT,
    "addr_subdistrict" TEXT,
    "addr_postal_code" VARCHAR(5),
    "addr_detail" TEXT,
    "asset_description" TEXT NOT NULL,
    "imei" VARCHAR(15),
    "serial_no" TEXT,
    "debt_amount_satang" INTEGER,
    "asset_value_satang" INTEGER,
    "suggested_team_id" UUID,
    "assigned_team_id" UUID,
    "team_change_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "outcome" "case_outcome",
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "case_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recycle_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "status" "recycle_status" NOT NULL DEFAULT 'pending',
    "request_note" TEXT NOT NULL,
    "decision_note" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "recycle_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "tracking_round" INTEGER NOT NULL DEFAULT 1,
    "status" "assignment_status" NOT NULL DEFAULT 'pending',
    "scheduled_date" DATE,
    "accepted_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "reassigned_from" UUID,
    "reassign_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "case_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "checkin_type" "checkin_type" NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "address_note" TEXT,
    "note" TEXT,
    "checked_in_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_evidences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "outcome" "case_outcome" NOT NULL,
    "status" "evidence_status" NOT NULL DEFAULT 'pending',
    "product_photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "video_url" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "travel_origin_lat" DECIMAL(10,7),
    "travel_origin_lng" DECIMAL(10,7),
    "travel_origin_source" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "case_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "lot_id" UUID,
    "case_ref" TEXT NOT NULL,
    "debtor_name" TEXT NOT NULL,
    "device_desc" TEXT NOT NULL,
    "imei_contract" VARCHAR(15),
    "imei_actual" VARCHAR(15),
    "serial_contract" TEXT,
    "serial_actual" TEXT,
    "asset_status" "asset_status" NOT NULL DEFAULT 'pending_intake',
    "condition" "asset_condition",
    "condition_note" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "closed_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "rejected_at" TIMESTAMPTZ(6),
    "rejected_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_lots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "lot_number" TEXT NOT NULL,
    "doc_ref" TEXT NOT NULL,
    "type" "handover_type" NOT NULL,
    "status" "handover_lot_status" NOT NULL DEFAULT 'pending_attach',
    "scheduled_at" TIMESTAMPTZ(6),
    "contact_person" TEXT,
    "delivery_addr" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "tracking_no" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "signed_doc_url" TEXT,
    "delivery_proof_url" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "handover_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payee_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "payee_type" "payee_type" NOT NULL DEFAULT 'individual',
    "tax_profile_id" UUID,
    "bank_name" TEXT,
    "account_name" TEXT,
    "account_number" TEXT,
    "national_id" VARCHAR(13),
    "id_document_url" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID,
    "assignment_id" UUID,
    "payee_id" UUID NOT NULL,
    "expense_type" "expense_type" NOT NULL,
    "gross_satang" INTEGER NOT NULL,
    "calculation_source" TEXT,
    "comp_plan_id" UUID,
    "comp_plan_version" INTEGER,
    "status" "expense_status" NOT NULL DEFAULT 'pending_warehouse_confirm',
    "manager_approved_by" UUID,
    "manager_approved_at" TIMESTAMPTZ(6),
    "finance_approved_by" UUID,
    "finance_approved_at" TIMESTAMPTZ(6),
    "executive_approved_by" UUID,
    "executive_approved_at" TIMESTAMPTZ(6),
    "approval_step_current" INTEGER NOT NULL DEFAULT 1,
    "approval_step_total" INTEGER NOT NULL DEFAULT 2,
    "approval_history" JSONB NOT NULL DEFAULT '[]',
    "approval_matrix_id" UUID,
    "rejection_reason" TEXT,
    "revision_note" TEXT,
    "payout_batch_item_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "payee_id" UUID NOT NULL,
    "requested_satang" INTEGER NOT NULL,
    "approved_satang" INTEGER,
    "used_satang" INTEGER NOT NULL DEFAULT 0,
    -- generated column (`02` §8) — DB คำนวณเอง ห้าม INSERT/UPDATE ค่าลงคอลัมน์นี้
    -- `used > approved` ต้องได้ 0 ไม่ใช่ค่าติดลบ (Rule 01)
    "return_satang" INTEGER GENERATED ALWAYS AS (GREATEST(0, COALESCE("approved_satang", 0) - "used_satang")) STORED,
    "status" "advance_status" NOT NULL DEFAULT 'pending_approval',
    "purpose" TEXT NOT NULL,
    "due_clear_date" DATE NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "cleared_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "payout_batch_item_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "side" "payout_batch_side" NOT NULL,
    "status" "payout_batch_status" NOT NULL DEFAULT 'draft',
    "gross_satang" INTEGER NOT NULL DEFAULT 0,
    "wht_satang" INTEGER NOT NULL DEFAULT 0,
    "net_satang" INTEGER NOT NULL DEFAULT 0,
    "bank_account_id" UUID,
    "payment_file_url" TEXT,
    "payment_file_generated_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batch_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "payout_batch_id" UUID NOT NULL,
    "expense_id" UUID,
    "advance_id" UUID,
    "payee_id" UUID NOT NULL,
    "tracking_round" INTEGER NOT NULL DEFAULT 1,
    "gross_satang" INTEGER NOT NULL,
    "wht_satang" INTEGER NOT NULL DEFAULT 0,
    "net_satang" INTEGER NOT NULL,
    "tax_profile_id" UUID,
    "wht_pct_snapshot" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "payout_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "billing_batch_id" UUID,
    "tracking_round" INTEGER NOT NULL DEFAULT 1,
    "gross_satang" INTEGER NOT NULL,
    "vat_satang" INTEGER NOT NULL DEFAULT 0,
    "vat_rate_pct_used" DECIMAL(5,2) NOT NULL DEFAULT 7.00,
    "total_satang" INTEGER NOT NULL,
    "fee_model_snapshot" "service_fee_model" NOT NULL,
    "status" "revenue_status" NOT NULL DEFAULT 'ready_for_billing',
    "revenue_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" "billing_batch_status" NOT NULL DEFAULT 'draft',
    "total_satang" INTEGER NOT NULL DEFAULT 0,
    "received_satang" INTEGER NOT NULL DEFAULT 0,
    "wht_withheld_by_customer_satang" INTEGER NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "sent_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "billing_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "adjustment_type" "adjustment_type" NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "adjustment_status" NOT NULL DEFAULT 'pending_approval',
    "period_status_at_target" TEXT,
    "revenue_id" UUID,
    "expense_id" UUID,
    "billing_batch_id" UUID,
    "payout_batch_id" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_label" TEXT NOT NULL,
    "year_be" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "accounting_period_status" NOT NULL DEFAULT 'collecting',
    "export_ready" BOOLEAN NOT NULL DEFAULT false,
    "last_readiness_checked_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "sent_by" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "billing_batch_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "total_before_vat_satang" INTEGER NOT NULL,
    "vat_satang" INTEGER NOT NULL DEFAULT 0,
    "total_satang" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "sales_record_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "status" "tax_invoice_status" NOT NULL DEFAULT 'active',
    "cancel_reason" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "tax_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "billing_batch_id" UUID NOT NULL,
    "bank_transaction_id" UUID,
    "amount_satang" INTEGER NOT NULL,
    "wht_withheld_by_customer_satang" INTEGER NOT NULL DEFAULT 0,
    "received_date" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "cash_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "payout_batch_item_id" UUID NOT NULL,
    "cost_center_id" UUID,
    "gross_satang" INTEGER NOT NULL,
    "wht_satang" INTEGER NOT NULL DEFAULT 0,
    "net_satang" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expense_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "payee_id" UUID NOT NULL,
    "expense_record_id" UUID NOT NULL,
    "income_type" TEXT NOT NULL DEFAULT 'ค่าจ้างทำของ มาตรา 40(8)',
    "payment_date" DATE NOT NULL,
    "gross_satang" INTEGER NOT NULL,
    "wht_satang" INTEGER NOT NULL,
    "filing_form" "wht_filing_form" NOT NULL,
    "delivery_format" "wht_delivery_format" NOT NULL DEFAULT 'paper',
    "status" "wht_certificate_status" NOT NULL DEFAULT 'active',
    "cancel_reason" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "replaces_certificate_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "wht_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_filing_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "period_label" TEXT NOT NULL,
    "filing_due_date" DATE NOT NULL,
    "pnd3_satang" INTEGER NOT NULL DEFAULT 0,
    "pnd53_satang" INTEGER NOT NULL DEFAULT 0,
    "status" "wht_filing_status" NOT NULL DEFAULT 'pending',
    "filed_at" TIMESTAMPTZ(6),
    "filed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wht_filing_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "level" "exception_level" NOT NULL,
    "status" "exception_status" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_module" TEXT NOT NULL,
    "source_ref" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_note" TEXT,
    "authorized_by" UUID,
    "authorized_at" TIMESTAMPTZ(6),
    "authorize_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "match_status" "bank_match_status" NOT NULL DEFAULT 'unmatched',
    "match_note" TEXT,
    "matched_billing_id" UUID,
    "matched_payout_id" UUID,
    "matched_advance_id" UUID,
    "is_split_allocation" BOOLEAN NOT NULL DEFAULT false,
    "matched_by" UUID,
    "matched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "answer_text" TEXT,
    "answered_by" UUID,
    "answered_at" TIMESTAMPTZ(6),
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accountant_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "export_record_status" NOT NULL DEFAULT 'generated',
    "file_urls" JSONB NOT NULL DEFAULT '{}',
    "file_hash" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "sent_by" UUID,
    "accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "export_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "billing_batch_id" UUID,
    "allocated_satang" INTEGER NOT NULL,
    "is_credit" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "bank_transaction_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_wht_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "billing_batch_id" UUID,
    "certificate_number" TEXT NOT NULL,
    "certificate_date" DATE NOT NULL,
    "gross_satang" INTEGER NOT NULL,
    "wht_satang" INTEGER NOT NULL,
    "file_url" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customer_wht_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "action" "audit_action" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "before_data" JSONB,
    "after_data" JSONB,
    "reason" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_path" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "job_type" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_cases_org_status" ON "cases"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_cases_org_company" ON "cases"("organization_id", "company_id");

-- CreateIndex
CREATE INDEX "idx_cases_org_team" ON "cases"("organization_id", "assigned_team_id");

-- CreateIndex
CREATE INDEX "idx_cases_closed" ON "cases"("organization_id", "outcome", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "cases_organization_id_company_id_case_ref_tracking_round_key" ON "cases"("organization_id", "company_id", "case_ref", "tracking_round");

-- CreateIndex
CREATE INDEX "idx_case_docs_case" ON "case_documents"("case_id", "document_type");

-- CreateIndex
CREATE INDEX "idx_case_contacts_case" ON "case_contacts"("case_id");

-- CreateIndex
CREATE INDEX "idx_recycle_requests_case" ON "recycle_requests"("case_id", "status");

-- CreateIndex
CREATE INDEX "idx_assignments_case" ON "case_assignments"("case_id", "status");

-- CreateIndex
CREATE INDEX "idx_assignments_agent" ON "case_assignments"("agent_id", "status");

-- CreateIndex
CREATE INDEX "idx_checkins_case" ON "check_ins"("case_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "idx_evidences_case" ON "case_evidences"("case_id", "status");

-- CreateIndex
CREATE INDEX "idx_assets_org_status" ON "assets"("organization_id", "asset_status");

-- CreateIndex
CREATE INDEX "idx_assets_org_company" ON "assets"("organization_id", "company_id", "asset_status");

-- CreateIndex
CREATE INDEX "idx_assets_lot" ON "assets"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "handover_lots_lot_number_key" ON "handover_lots"("lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "handover_lots_doc_ref_key" ON "handover_lots"("doc_ref");

-- CreateIndex
CREATE INDEX "idx_lots_org_status" ON "handover_lots"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_lots_org_company" ON "handover_lots"("organization_id", "company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payee_profiles_organization_id_user_id_key" ON "payee_profiles"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_expenses_org_status" ON "expenses"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_expenses_case" ON "expenses"("case_id", "status");

-- CreateIndex
CREATE INDEX "idx_expenses_payee" ON "expenses"("payee_id", "status");

-- CreateIndex
CREATE INDEX "idx_advances_payee" ON "advances"("payee_id", "status");

-- CreateIndex
CREATE INDEX "idx_advances_due" ON "advances"("organization_id", "due_clear_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payout_batches_idempotency_key_key" ON "payout_batches"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_payout_batches_org" ON "payout_batches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_pbi_batch" ON "payout_batch_items"("payout_batch_id");

-- CreateIndex
CREATE INDEX "idx_pbi_expense" ON "payout_batch_items"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_batch_items_payout_batch_id_expense_id_key" ON "payout_batch_items"("payout_batch_id", "expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_batch_items_payout_batch_id_advance_id_key" ON "payout_batch_items"("payout_batch_id", "advance_id");

-- CreateIndex
CREATE INDEX "idx_revenues_org_status" ON "revenues"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_revenues_company" ON "revenues"("company_id", "status");

-- CreateIndex
CREATE INDEX "idx_revenues_case" ON "revenues"("case_id");

-- CreateIndex
CREATE INDEX "idx_billing_org_status" ON "billing_batches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_billing_company" ON "billing_batches"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_batches_organization_id_company_id_period_key" ON "billing_batches"("organization_id", "company_id", "period");

-- CreateIndex
CREATE INDEX "idx_adjustments_org_status" ON "adjustments"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_organization_id_year_be_month_key" ON "accounting_periods"("organization_id", "year_be", "month");

-- CreateIndex
CREATE UNIQUE INDEX "sales_records_billing_batch_id_key" ON "sales_records"("billing_batch_id");

-- CreateIndex
CREATE INDEX "idx_sales_records_period" ON "sales_records"("period_id");

-- CreateIndex
CREATE INDEX "idx_sales_records_company" ON "sales_records"("company_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_invoice_number_key" ON "tax_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "idx_tax_invoices_org" ON "tax_invoices"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_cash_receipts_period" ON "cash_receipts"("period_id");

-- CreateIndex
CREATE INDEX "idx_cash_receipts_billing" ON "cash_receipts"("billing_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_records_payout_batch_item_id_key" ON "expense_records"("payout_batch_item_id");

-- CreateIndex
CREATE INDEX "idx_expense_records_period" ON "expense_records"("period_id");

-- CreateIndex
CREATE UNIQUE INDEX "wht_certificates_certificate_number_key" ON "wht_certificates"("certificate_number");

-- CreateIndex
CREATE INDEX "idx_wht_certs_payee" ON "wht_certificates"("payee_id", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "wht_filing_summaries_period_id_key" ON "wht_filing_summaries"("period_id");

-- CreateIndex
CREATE UNIQUE INDEX "wht_filing_summaries_organization_id_period_id_key" ON "wht_filing_summaries"("organization_id", "period_id");

-- CreateIndex
CREATE INDEX "idx_exceptions_period" ON "exceptions"("period_id", "level", "status");

-- CreateIndex
CREATE INDEX "idx_bank_tx_period" ON "bank_transactions"("period_id", "match_status");

-- CreateIndex
CREATE INDEX "idx_bank_tx_account" ON "bank_transactions"("bank_account_id", "transaction_date");

-- CreateIndex
CREATE INDEX "idx_accountant_questions_period" ON "accountant_questions"("period_id", "is_resolved");

-- CreateIndex
CREATE INDEX "idx_exports_period" ON "export_records"("period_id", "version");

-- CreateIndex
CREATE INDEX "idx_bank_tx_alloc_billing" ON "bank_transaction_allocations"("billing_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_allocations_bank_transaction_id_billing_ba_key" ON "bank_transaction_allocations"("bank_transaction_id", "billing_batch_id");

-- CreateIndex
CREATE INDEX "idx_customer_wht_date" ON "customer_wht_certificates"("organization_id", "certificate_date");

-- CreateIndex
CREATE UNIQUE INDEX "customer_wht_certificates_organization_id_company_id_certif_key" ON "customer_wht_certificates"("organization_id", "company_id", "certificate_number");

-- CreateIndex
CREATE INDEX "idx_audit_target" ON "audit_logs"("organization_id", "target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_actor" ON "audit_logs"("organization_id", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_user" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_jobs_status" ON "jobs"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_bucket_path_key" ON "files"("bucket", "path");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_service_fee_template_id_fkey" FOREIGN KEY ("service_fee_template_id") REFERENCES "service_fee_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_suggested_team_id_fkey" FOREIGN KEY ("suggested_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_team_id_fkey" FOREIGN KEY ("assigned_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_contacts" ADD CONSTRAINT "case_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_contacts" ADD CONSTRAINT "case_contacts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_contacts" ADD CONSTRAINT "case_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_requests" ADD CONSTRAINT "recycle_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_requests" ADD CONSTRAINT "recycle_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_requests" ADD CONSTRAINT "recycle_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_requests" ADD CONSTRAINT "recycle_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_reassigned_from_fkey" FOREIGN KEY ("reassigned_from") REFERENCES "case_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "handover_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_lots" ADD CONSTRAINT "handover_lots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_lots" ADD CONSTRAINT "handover_lots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_lots" ADD CONSTRAINT "handover_lots_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_lots" ADD CONSTRAINT "handover_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_lots" ADD CONSTRAINT "handover_lots_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_profiles" ADD CONSTRAINT "payee_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_profiles" ADD CONSTRAINT "payee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_profiles" ADD CONSTRAINT "payee_profiles_tax_profile_id_fkey" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_profiles" ADD CONSTRAINT "payee_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_profiles" ADD CONSTRAINT "payee_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_profiles" ADD CONSTRAINT "payee_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_comp_plan_id_fkey" FOREIGN KEY ("comp_plan_id") REFERENCES "compensation_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approval_matrix_id_fkey" FOREIGN KEY ("approval_matrix_id") REFERENCES "approval_matrices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_manager_approved_by_fkey" FOREIGN KEY ("manager_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_finance_approved_by_fkey" FOREIGN KEY ("finance_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_executive_approved_by_fkey" FOREIGN KEY ("executive_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "payout_batch_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "payout_batch_items_payout_batch_id_fkey" FOREIGN KEY ("payout_batch_id") REFERENCES "payout_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "payout_batch_items_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "payout_batch_items_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "payout_batch_items_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "payout_batch_items_tax_profile_id_fkey" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "payout_batch_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_billing_batch_id_fkey" FOREIGN KEY ("billing_batch_id") REFERENCES "billing_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_revenue_id_fkey" FOREIGN KEY ("revenue_id") REFERENCES "revenues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_billing_batch_id_fkey" FOREIGN KEY ("billing_batch_id") REFERENCES "billing_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_payout_batch_id_fkey" FOREIGN KEY ("payout_batch_id") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_billing_batch_id_fkey" FOREIGN KEY ("billing_batch_id") REFERENCES "billing_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_sales_record_id_fkey" FOREIGN KEY ("sales_record_id") REFERENCES "sales_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_billing_batch_id_fkey" FOREIGN KEY ("billing_batch_id") REFERENCES "billing_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_payout_batch_item_id_fkey" FOREIGN KEY ("payout_batch_item_id") REFERENCES "payout_batch_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_records" ADD CONSTRAINT "expense_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_expense_record_id_fkey" FOREIGN KEY ("expense_record_id") REFERENCES "expense_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_replaces_certificate_id_fkey" FOREIGN KEY ("replaces_certificate_id") REFERENCES "wht_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_filing_summaries" ADD CONSTRAINT "wht_filing_summaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_filing_summaries" ADD CONSTRAINT "wht_filing_summaries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_filing_summaries" ADD CONSTRAINT "wht_filing_summaries_filed_by_fkey" FOREIGN KEY ("filed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_authorized_by_fkey" FOREIGN KEY ("authorized_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_billing_id_fkey" FOREIGN KEY ("matched_billing_id") REFERENCES "billing_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_payout_id_fkey" FOREIGN KEY ("matched_payout_id") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_advance_id_fkey" FOREIGN KEY ("matched_advance_id") REFERENCES "advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_by_fkey" FOREIGN KEY ("matched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_questions" ADD CONSTRAINT "accountant_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_questions" ADD CONSTRAINT "accountant_questions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_questions" ADD CONSTRAINT "accountant_questions_answered_by_fkey" FOREIGN KEY ("answered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_questions" ADD CONSTRAINT "accountant_questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_records" ADD CONSTRAINT "export_records_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_allocations" ADD CONSTRAINT "bank_transaction_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_allocations" ADD CONSTRAINT "bank_transaction_allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_allocations" ADD CONSTRAINT "bank_transaction_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_allocations" ADD CONSTRAINT "bank_transaction_allocations_billing_batch_id_fkey" FOREIGN KEY ("billing_batch_id") REFERENCES "billing_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_allocations" ADD CONSTRAINT "bank_transaction_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_certificates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_certificates_billing_batch_id_fkey" FOREIGN KEY ("billing_batch_id") REFERENCES "billing_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_certificates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wht_certificates" ADD CONSTRAINT "customer_wht_certificates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- ส่วนที่ Prisma ไม่รองรับ — เขียนเป็น raw SQL (Rule 02)
-- CHECK constraint / partial unique index / generated column
-- ═══════════════════════════════════════════════════════════════

-- ── advances: ห้ามเบิกซ้อน (`02` §8 · `15` §9.2 — DEC-006/D7) ──
-- 1 payee ถือ Advance ค้าง (approved|overdue) ได้ครั้งละ 1 รายการเท่านั้น
CREATE UNIQUE INDEX "uniq_active_advance_per_payee"
  ON "advances"("payee_id")
  WHERE "status" IN ('approved', 'overdue') AND "deleted_at" IS NULL;

-- ── assets: IMEI/Serial (A6 — มติ PO 2026-08-12) ──
-- เดิม UNIQUE(org, imei_contract) แบบเต็มตาราง → เครื่องเดิมที่ recycle กลับมาอีกรอบชน unique ทันที
-- และ tablet Wi-Fi ที่ไม่มี IMEI insert ไม่ได้เลย
-- ใหม่: partial unique เฉพาะเครื่องที่ยัง**ไม่ส่งมอบ** + บังคับให้มี identifier อย่างน้อย 1 อย่าง
CREATE UNIQUE INDEX "uniq_assets_active_imei"
  ON "assets"("organization_id", "imei_contract")
  WHERE "imei_contract" IS NOT NULL AND "asset_status" <> 'handed_over' AND "deleted_at" IS NULL;

ALTER TABLE "assets" ADD CONSTRAINT "assets_identifier_required" CHECK (
  "imei_contract" IS NOT NULL OR "serial_contract" IS NOT NULL
);

-- ── payout_batch_items: แหล่งที่มา 1 อย่างเท่านั้น (A4 — DEC-004 separate FK) ──
ALTER TABLE "payout_batch_items" ADD CONSTRAINT "pbi_one_source" CHECK (
  (CASE WHEN "expense_id" IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN "advance_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
);

-- ── adjustments: polymorphic target 1 อย่างเท่านั้น (`02` §8 — DEC-004) ──
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_one_target" CHECK (
  (CASE WHEN "revenue_id" IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN "expense_id" IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN "billing_batch_id" IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN "payout_batch_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
);

-- ── bank_transactions: จับคู่ได้ทางเดียว + สถานะต้องตรงรูปทรงของ FK ──
-- (`02` §9 — DEC-006/D7) ขยายตามมติ PO: +matched_advance_id (A4) และ +is_split_allocation (A2)
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_tx_one_match" CHECK (
  (CASE WHEN "matched_billing_id" IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN "matched_payout_id"  IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN "matched_advance_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
);

ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_tx_status_fk_shape" CHECK (
  (
    "match_status" IN ('auto_matched', 'manual_matched')
    AND (
      -- จับคู่ตรง 1:1 กับเอกสารใบเดียว
      ("is_split_allocation" = false AND (
        "matched_billing_id" IS NOT NULL OR "matched_payout_id" IS NOT NULL OR "matched_advance_id" IS NOT NULL))
      -- A2: จับคู่แบบแบ่งยอด — รายละเอียดอยู่ที่ bank_transaction_allocations
      OR ("is_split_allocation" = true AND
        "matched_billing_id" IS NULL AND "matched_payout_id" IS NULL AND "matched_advance_id" IS NULL)
    )
  )
  OR (
    "match_status" IN ('unmatched', 'unmatched_resolved')
    AND "is_split_allocation" = false
    AND "matched_billing_id" IS NULL AND "matched_payout_id" IS NULL AND "matched_advance_id" IS NULL
  )
);

-- ── bank_transaction_allocations (A2) ──
-- แถวปกติ = ตัดเข้ารอบบิล · แถว credit = ส่วนเกินของบริษัท (ไม่ให้ AR ติดลบ)
ALTER TABLE "bank_transaction_allocations" ADD CONSTRAINT "bank_tx_alloc_shape" CHECK (
  ("is_credit" = false AND "billing_batch_id" IS NOT NULL)
  OR ("is_credit" = true AND "billing_batch_id" IS NULL)
);

ALTER TABLE "bank_transaction_allocations" ADD CONSTRAINT "bank_tx_alloc_amount_positive" CHECK (
  "allocated_satang" > 0
);

-- ── updated_at DEFAULT NOW() (`02` §2.4) ──
-- Prisma `@updatedAt` เซ็ตค่าที่ app layer เท่านั้น ไม่ออก DB default (เหตุผลเต็มอยู่ใน migration 20260813220500)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
      AND table_name <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT NOW()', t);
  END LOOP;
END $$;

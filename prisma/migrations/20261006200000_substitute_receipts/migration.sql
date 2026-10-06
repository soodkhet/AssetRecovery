-- ใบรับรองแทนใบเสร็จรับเงิน (มติ PO 06/10/2569 U103 · `02` v4.43 · `15` §9.4 · `41` §6.6 · `22` §6.17)
--
-- 1) ตาราง `substitute_receipts` + `substitute_receipt_lines` — ผู้จ่ายเงิน (payee) รับรองรายจ่ายที่เรียกใบเสร็จไม่ได้
--    ผูกกับใบเบิกแยก (`expense_id`) หรือการเคลียร์เงินทดรอง (`advance_id`) อย่างใดอย่างหนึ่ง (DEC-004 CHECK exactly-one)
-- 2) เพดานต่อใบ/ต่อคนต่อเดือน ที่ `finance_policy_settings` (ค่าเริ่มต้น ฿500 / ฿3,000)
-- 3) `document_number_max_seq()` รู้จักตารางใหม่ (เลข CRT — ตัวนับ `substitute_receipt` ของ U102)

-- ── enum ─────────────────────────────────────────────────────────────────────
CREATE TYPE "substitute_receipt_status" AS ENUM ('pending_signature', 'signed');

-- ── เพดาน (ค่าตั้งนโยบายการเงิน) ───────────────────────────────────────────────
ALTER TABLE "finance_policy_settings"
  ADD COLUMN "substitute_receipt_max_per_doc_satang" INTEGER NOT NULL DEFAULT 50000,
  ADD COLUMN "substitute_receipt_max_per_month_satang" INTEGER NOT NULL DEFAULT 300000,
  ADD CONSTRAINT "chk_finance_policy_substitute_receipt_caps"
    CHECK (substitute_receipt_max_per_doc_satang > 0 AND substitute_receipt_max_per_month_satang > 0);

-- ── ใบรับรองแทนใบเสร็จ ───────────────────────────────────────────────────────
CREATE TABLE "substitute_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "payee_id" UUID NOT NULL,
    "expense_id" UUID,
    "advance_id" UUID,
    "issue_date" DATE NOT NULL,
    "total_satang" INTEGER NOT NULL,
    "status" "substitute_receipt_status" NOT NULL DEFAULT 'pending_signature',
    "signed_file_path" TEXT,
    "signed_file_sha256" VARCHAR(64),
    "signed_at" TIMESTAMPTZ(6),
    "signed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "substitute_receipts_pkey" PRIMARY KEY ("id"),
    -- DEC-004: ผูกกับใบเบิกหรือเงินทดรอง อย่างใดอย่างหนึ่งเท่านั้น
    CONSTRAINT "chk_substitute_receipts_exactly_one_link" CHECK (num_nonnulls(expense_id, advance_id) = 1),
    CONSTRAINT "chk_substitute_receipts_total_positive" CHECK (total_satang > 0),
    -- ฉบับเซ็นแล้ว ⇔ มีไฟล์ + SHA-256 + เวลา/ผู้อัปโหลดครบ
    CONSTRAINT "chk_substitute_receipts_signed_shape" CHECK (
      (status = 'signed') = (signed_file_path IS NOT NULL AND signed_file_sha256 IS NOT NULL AND signed_at IS NOT NULL AND signed_by IS NOT NULL)
    )
);

CREATE TABLE "substitute_receipt_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "substitute_receipt_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "line_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount_satang" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "substitute_receipt_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_substitute_receipt_lines_amount_positive" CHECK (amount_satang > 0),
    CONSTRAINT "chk_substitute_receipt_lines_no" CHECK (line_no >= 1),
    CONSTRAINT "chk_substitute_receipt_lines_description" CHECK (length(btrim(description)) > 0)
);

CREATE UNIQUE INDEX "uniq_substitute_receipt_number" ON "substitute_receipts"("organization_id", "receipt_number");
CREATE INDEX "idx_substitute_receipts_org_payee_date" ON "substitute_receipts"("organization_id", "payee_id", "issue_date");
-- ใบเบิก/เงินทดรอง 1 รายการมีใบรับรองแทนใบเสร็จได้ไม่เกิน 1 ใบ (ที่ยังไม่ถูกลบ)
CREATE UNIQUE INDEX "uniq_substitute_receipts_expense" ON "substitute_receipts"("expense_id")
  WHERE expense_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX "uniq_substitute_receipts_advance" ON "substitute_receipts"("advance_id")
  WHERE advance_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX "uniq_substitute_receipt_lines_no" ON "substitute_receipt_lines"("substitute_receipt_id", "line_no");

ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_signed_by_fkey" FOREIGN KEY ("signed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "substitute_receipt_lines" ADD CONSTRAINT "substitute_receipt_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "substitute_receipt_lines" ADD CONSTRAINT "substitute_receipt_lines_substitute_receipt_id_fkey" FOREIGN KEY ("substitute_receipt_id") REFERENCES "substitute_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "substitute_receipt_lines" ADD CONSTRAINT "substitute_receipt_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ออกแล้วแก้ไม่ได้ (Immutable — `02` §13) ─────────────────────────────────────
-- เปลี่ยนได้เฉพาะ: `pending_signature` → `signed` พร้อมไฟล์ฉบับเซ็น (ครั้งเดียว) · soft delete · updated_*
CREATE OR REPLACE FUNCTION substitute_receipts_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.payee_id IS DISTINCT FROM OLD.payee_id
     OR NEW.expense_id IS DISTINCT FROM OLD.expense_id
     OR NEW.advance_id IS DISTINCT FROM OLD.advance_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.total_satang IS DISTINCT FROM OLD.total_satang
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'ใบรับรองแทนใบเสร็จ % ออกแล้วแก้ไขไม่ได้', OLD.receipt_number USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'signed' AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.signed_file_path IS DISTINCT FROM OLD.signed_file_path
       OR NEW.signed_file_sha256 IS DISTINCT FROM OLD.signed_file_sha256
       OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
       OR NEW.signed_by IS DISTINCT FROM OLD.signed_by) THEN
    RAISE EXCEPTION 'ใบรับรองแทนใบเสร็จ % อัปโหลดฉบับเซ็นแล้ว เปลี่ยนไฟล์ไม่ได้', OLD.receipt_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_substitute_receipts_guard
  BEFORE UPDATE ON substitute_receipts
  FOR EACH ROW EXECUTE FUNCTION substitute_receipts_guard_update();

-- บรรทัดรายจ่าย insert-only — ห้าม UPDATE (ลบได้เฉพาะ cascade ตามใบ)
CREATE OR REPLACE FUNCTION substitute_receipt_lines_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'บรรทัดของใบรับรองแทนใบเสร็จแก้ไขไม่ได้' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_substitute_receipt_lines_guard
  BEFORE UPDATE ON substitute_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION substitute_receipt_lines_guard_update();

-- ── เลข CRT: ลำดับสูงสุดที่มีจริง (ใช้ตอนขึ้นปีใหม่/ลงวันที่ย้อนปี — U102) ───────────
CREATE OR REPLACE FUNCTION document_number_max_seq(
  p_organization_id uuid, p_doc_type document_number_type, p_head text
) RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_table  text;
  v_column text;
  v_max    int;
BEGIN
  CASE p_doc_type
    WHEN 'tax_invoice'        THEN v_table := 'tax_invoices';        v_column := 'invoice_number';
    WHEN 'billing_batch'      THEN v_table := 'billing_batches';     v_column := 'batch_number';
    WHEN 'handover_lot'       THEN v_table := 'handover_lots';       v_column := 'lot_number';
    WHEN 'delivery_note'      THEN v_table := 'handover_lots';       v_column := 'doc_ref';
    WHEN 'payment_voucher'    THEN v_table := 'payout_batch_items';  v_column := 'voucher_number';
    WHEN 'wht_certificate'    THEN v_table := 'wht_certificates';    v_column := 'certificate_number';
    WHEN 'advance'            THEN v_table := 'advances';            v_column := 'advance_number';
    WHEN 'advance_return'     THEN v_table := 'advance_returns';     v_column := 'return_number';
    WHEN 'substitute_receipt' THEN v_table := 'substitute_receipts'; v_column := 'receipt_number';
    ELSE RETURN 0;
  END CASE;

  -- head มีแค่ A-Z/0-9/- (CHECK ของ prefix + ปีตัวเลข) ⇒ ใช้ใน regex/LIKE ได้ตรง ๆ ไม่มีอักขระพิเศษ
  EXECUTE format(
    'SELECT COALESCE(MAX((substring(%1$I FROM %2$L))::int), 0) FROM %3$I
      WHERE organization_id = $1 AND %1$I LIKE $2',
    v_column, '^' || p_head || '([0-9]+)$', v_table
  ) INTO v_max USING p_organization_id, p_head || '%';
  RETURN v_max;
END;
$$;

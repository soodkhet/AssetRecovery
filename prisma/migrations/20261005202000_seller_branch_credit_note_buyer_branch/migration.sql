-- สำนักงานใหญ่/สาขาของผู้ขาย + สาขาผู้ซื้อบนใบลดหนี้/ใบเพิ่มหนี้ — มติ PO 06/10/2569 (UAT U82 · ประมวลรัษฎากร ม.86/4)
-- ต่อยอด `20261005201000_finance_company_branch_code` (U77 — สาขาผู้ซื้อบนใบกำกับ)
--
-- รหัสสาขา 5 หลักตามแบบกรมสรรพากร: `00000` = สำนักงานใหญ่ · `00001`… = สาขาที่
-- ① organizations.branch_code — ค่าตั้งองค์กร (คู่กับ tax_id) · องค์กรเดิม = สำนักงานใหญ่
-- ② tax_invoices.seller_branch_code — snapshot ตอนออกใบ (ห้ามอ่านค่า live ย้อนหลัง)
--    ใบเดิม = สำนักงานใหญ่ (ADD COLUMN + DEFAULT เติมค่าโดยไม่ยิง trigger immutable) แล้วถอด DEFAULT
-- ③ credit_notes.buyer_branch_code — snapshot สาขาผู้ซื้อ "ตามใบกำกับเดิม" (= tax_invoices.buyer_branch_code)
--    เอกสารเดิม backfill จากใบกำกับที่อ้างถึง · เอกสารใหม่ต้องตรงกับใบกำกับเสมอ (trigger ตรวจ)

-- ① ค่าตั้งองค์กร
ALTER TABLE "organizations" ADD COLUMN "branch_code" VARCHAR(5) NOT NULL DEFAULT '00000';

ALTER TABLE "organizations" ADD CONSTRAINT "chk_organizations_branch_code"
  CHECK (branch_code ~ '^[0-9]{5}$');

-- ② snapshot สาขาผู้ขายบนใบกำกับภาษี
ALTER TABLE "tax_invoices" ADD COLUMN "seller_branch_code" VARCHAR(5) NOT NULL DEFAULT '00000';
ALTER TABLE "tax_invoices" ALTER COLUMN "seller_branch_code" DROP DEFAULT;

ALTER TABLE "tax_invoices" ADD CONSTRAINT "chk_tax_invoices_seller_branch_code"
  CHECK (seller_branch_code ~ '^[0-9]{5}$');

-- ยาม immutable (`02` §13) — snapshot สาขาทั้งสองฝั่งเปลี่ยนไม่ได้ (ใบ active แก้ได้ทางเดียวคือยกเลิก)
CREATE OR REPLACE FUNCTION tax_invoices_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % ลบไม่ได้ — ยกเลิกเท่านั้น (31 §9.1 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % ถูกยกเลิกแล้ว ห้ามแก้/ห้าม reverse (31 §9.1 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'cancelled'
     OR NEW.invoice_number     <> OLD.invoice_number
     OR NEW.invoice_date       <> OLD.invoice_date
     OR NEW.sales_record_id    <> OLD.sales_record_id
     OR NEW.organization_id    <> OLD.organization_id
     OR NEW.buyer_branch_code  <> OLD.buyer_branch_code
     OR NEW.seller_branch_code <> OLD.seller_branch_code THEN
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % แก้ได้ทางเดียวคือยกเลิก (31 §10 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ③ snapshot สาขาผู้ซื้อบนใบลดหนี้/ใบเพิ่มหนี้
ALTER TABLE "credit_notes" ADD COLUMN "buyer_branch_code" VARCHAR(5) NOT NULL DEFAULT '00000';

-- backfill จากใบกำกับที่อ้างถึง — ปิดยาม immutable ชั่วคราวเฉพาะใน migration นี้ (transaction เดียวกัน)
ALTER TABLE "credit_notes" DISABLE TRIGGER trg_credit_notes_no_update;
UPDATE "credit_notes" c
   SET buyer_branch_code = t.buyer_branch_code
  FROM "tax_invoices" t
 WHERE t.id = c.tax_invoice_id
   AND c.buyer_branch_code <> t.buyer_branch_code;
ALTER TABLE "credit_notes" ENABLE TRIGGER trg_credit_notes_no_update;

ALTER TABLE "credit_notes" ALTER COLUMN "buyer_branch_code" DROP DEFAULT;

ALTER TABLE "credit_notes" ADD CONSTRAINT "chk_credit_notes_buyer_branch_code"
  CHECK (buyer_branch_code ~ '^[0-9]{5}$');

-- เอกสารใหม่: สาขาผู้ซื้อต้องตรงกับ snapshot บนใบกำกับเดิม (ไม่ใช่ค่าปัจจุบันของบริษัท)
CREATE OR REPLACE FUNCTION credit_notes_guard_buyer_branch() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inv_branch VARCHAR(5);
BEGIN
  SELECT t.buyer_branch_code INTO inv_branch FROM tax_invoices t WHERE t.id = NEW.tax_invoice_id;
  IF inv_branch IS NULL OR NEW.buyer_branch_code <> inv_branch THEN
    RAISE EXCEPTION 'CREDIT_NOTE_BRANCH_MISMATCH: สาขาผู้ซื้อ % ไม่ตรงกับใบกำกับเดิม (%)',
      NEW.buyer_branch_code, inv_branch
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_credit_notes_buyer_branch
  BEFORE INSERT ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION credit_notes_guard_buyer_branch();

-- ยาม immutable (+ buyer_branch_code)
CREATE OR REPLACE FUNCTION credit_notes_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_IMMUTABLE: เอกสาร % ลบไม่ได้ — ยกเลิกเท่านั้น', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_IMMUTABLE: เอกสาร % ถูกยกเลิกแล้ว ห้ามแก้/ห้าม reverse', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'cancelled'
     OR NEW.organization_id <> OLD.organization_id
     OR NEW.tax_invoice_id <> OLD.tax_invoice_id
     OR NEW.note_type <> OLD.note_type
     OR NEW.adjustment_id IS DISTINCT FROM OLD.adjustment_id
     OR NEW.credit_note_number <> OLD.credit_note_number
     OR NEW.issue_date <> OLD.issue_date
     OR NEW.amount_before_vat_satang <> OLD.amount_before_vat_satang
     OR NEW.vat_satang <> OLD.vat_satang
     OR NEW.total_satang <> OLD.total_satang
     OR NEW.vat_rate_pct_used <> OLD.vat_rate_pct_used
     OR NEW.buyer_branch_code <> OLD.buyer_branch_code
     OR NEW.reason <> OLD.reason
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256 THEN
    RAISE EXCEPTION 'CREDIT_NOTE_IMMUTABLE: เอกสาร % แก้ได้ทางเดียวคือยกเลิก', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- สำนักงานใหญ่/สาขาของผู้ซื้อบนใบกำกับภาษี — มติ PO 05/10/2569 (UAT U77 · ประมวลรัษฎากร ม.86/4)
-- `10` §7.1 · `31` §7.2 · `02` §5
--
-- รหัสสาขา 5 หลักตามแบบกรมสรรพากร: `00000` = สำนักงานใหญ่ · `00001`… = สาขาที่
-- ① finance_companies.branch_code — ค่าปัจจุบันของบริษัท (ข้อมูลเดิมทั้งหมด = สำนักงานใหญ่)
-- ② tax_invoices.buyer_branch_code — snapshot ตอนออกใบ (Rule 08 — ห้ามอ่านค่า live ย้อนหลัง)
--    ใบเดิมที่ออกก่อนมีช่องนี้ = สำนักงานใหญ่ (ADD COLUMN + DEFAULT เติมค่าโดยไม่ยิง trigger immutable)
--    แล้วถอด DEFAULT ทิ้ง ⇒ ใบใหม่ต้องระบุค่าที่ snapshot มาเสมอ

-- AlterTable
ALTER TABLE "finance_companies" ADD COLUMN "branch_code" VARCHAR(5) NOT NULL DEFAULT '00000';

ALTER TABLE "finance_companies" ADD CONSTRAINT "chk_finance_companies_branch_code"
  CHECK (branch_code ~ '^[0-9]{5}$');

-- AlterTable — snapshot บนใบกำกับภาษี
ALTER TABLE "tax_invoices" ADD COLUMN "buyer_branch_code" VARCHAR(5) NOT NULL DEFAULT '00000';
ALTER TABLE "tax_invoices" ALTER COLUMN "buyer_branch_code" DROP DEFAULT;

ALTER TABLE "tax_invoices" ADD CONSTRAINT "chk_tax_invoices_buyer_branch_code"
  CHECK (buyer_branch_code ~ '^[0-9]{5}$');

-- ยาม immutable (`02` §13) — snapshot สาขาเปลี่ยนไม่ได้เหมือนเลขที่/วันที่ (ใบ active แก้ได้ทางเดียวคือยกเลิก)
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
     OR NEW.invoice_number    <> OLD.invoice_number
     OR NEW.invoice_date      <> OLD.invoice_date
     OR NEW.sales_record_id   <> OLD.sales_record_id
     OR NEW.organization_id   <> OLD.organization_id
     OR NEW.buyer_branch_code <> OLD.buyer_branch_code THEN
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % แก้ได้ทางเดียวคือยกเลิก (31 §10 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

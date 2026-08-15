-- Phase 4.3 — Immutable Rules ของใบกำกับภาษี (`02` §13 · `31` §9.1/§10)
--
-- กติกา 3 ข้อที่ต้องบังคับถึงระดับ DB (ไม่ใช่แค่ service layer):
--   ① ใบที่ `cancelled` แล้ว **ห้ามแก้ ห้าม reverse** กลับเป็น active
--   ② ใบที่ `active` แก้ได้ทางเดียวคือ "ยกเลิก" — ห้ามแก้เลขที่/วันที่/รายการขายที่ผูกอยู่
--   ③ **ห้าม DELETE ทุกกรณี** — ลบใบใดใบหนึ่งทิ้ง = เลขที่ขาดช่วง ซึ่งผิดข้อกำหนดกรมสรรพากร
--      (`31` §6.2 "เลขที่ต้องเรียงลำดับต่อเนื่องไม่ขาดช่วงเสมอ")

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
     OR NEW.invoice_number  <> OLD.invoice_number
     OR NEW.invoice_date    <> OLD.invoice_date
     OR NEW.sales_record_id <> OLD.sales_record_id
     OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % แก้ได้ทางเดียวคือยกเลิก (31 §10 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION tax_invoices_immutable() IS
  'ยาม immutable ของ tax_invoices (`02` §13) — ห้ามลบทุกกรณี · cancelled ห้ามแก้ · active แก้ได้เฉพาะการยกเลิก';

DROP TRIGGER IF EXISTS trg_tax_invoices_no_update ON tax_invoices;
DROP TRIGGER IF EXISTS trg_tax_invoices_no_delete ON tax_invoices;

CREATE TRIGGER trg_tax_invoices_no_update
  BEFORE UPDATE ON tax_invoices
  FOR EACH ROW
  EXECUTE FUNCTION tax_invoices_immutable();

CREATE TRIGGER trg_tax_invoices_no_delete
  BEFORE DELETE ON tax_invoices
  FOR EACH ROW
  EXECUTE FUNCTION tax_invoices_immutable();

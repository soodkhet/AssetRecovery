-- ใบเสร็จรับเงิน/ใบกำกับภาษี ตอนรับเงิน — มติ PO 06/10/2569 U95 + U96 (#3 #4 #7 #8 #9)
-- (ประมวลรัษฎากร ม.78/1(2) — ค่าบริการ: ความรับผิด VAT เกิดเมื่อได้รับชำระ · ม.86/4 · ม.105 ทวิ)
--
-- ① ชนิดเอกสาร `tax_invoice_doc_kind`
--    `tax_invoice`         = ใบกำกับภาษีแบบเดิม (ออกตอนวางบิล — ข้อมูลก่อน U95 · ยังยกเลิก/ออกแทนได้)
--    `receipt_tax_invoice` = "ใบเสร็จรับเงิน/ใบกำกับภาษี" ออกตอนรับเงิน (1 เงินรับ = 1 ใบ active)
-- ② ยอดของใบเก็บบนใบเอง (snapshot — รับเงินบางส่วนได้หลายใบต่อรอบวางบิล) + อัตรา VAT ที่ใช้ (ณ วันรับเงิน)
-- ③ snapshot ผู้ขาย/ผู้ซื้อ (ชื่อ/ที่อยู่/เลขผู้เสียภาษี/โทร) + รูปแบบการส่ง + รายละเอียด ตอนออก (U96 #4 · ปิด D13 ส่วน delivery_format)
-- ④ ใบที่ออกแทนใบที่ยกเลิก ⇒ `replaces_tax_invoice_id` (U96 #8)
-- ⑤ partial unique แยกตามชนิด · ยาม immutable ครอบคลุมคอลัมน์ใหม่ · ยามยอดใบลดหนี้อ่านยอดจากใบเอง

-- ① enum + คอลัมน์ชนิด
CREATE TYPE "tax_invoice_doc_kind" AS ENUM ('tax_invoice', 'receipt_tax_invoice');

ALTER TABLE "tax_invoices"
  ADD COLUMN "doc_kind" "tax_invoice_doc_kind" NOT NULL DEFAULT 'tax_invoice',
  ADD COLUMN "cash_receipt_id" UUID,
  ADD COLUMN "replaces_tax_invoice_id" UUID,
  ADD COLUMN "amount_before_vat_satang" INTEGER,
  ADD COLUMN "vat_satang" INTEGER,
  ADD COLUMN "total_satang" INTEGER,
  ADD COLUMN "vat_rate_pct_used" NUMERIC(5,2),
  ADD COLUMN "seller_name" TEXT,
  ADD COLUMN "seller_tax_id" VARCHAR(13),
  ADD COLUMN "seller_address" TEXT,
  ADD COLUMN "seller_phone" VARCHAR(20),
  ADD COLUMN "buyer_name" TEXT,
  ADD COLUMN "buyer_tax_id" VARCHAR(13),
  ADD COLUMN "buyer_address" TEXT,
  ADD COLUMN "buyer_phone" VARCHAR(20),
  ADD COLUMN "delivery_format" "invoice_delivery_format",
  ADD COLUMN "description" TEXT;

-- เงินรับถูกถอน (เปลี่ยนการจับคู่) ได้เฉพาะเมื่อไม่มีใบ active (ยามที่ service) ⇒ ใบที่ยกเลิกแล้วคงอยู่ แต่ลิงก์เป็น NULL
ALTER TABLE "tax_invoices"
  ADD CONSTRAINT "tax_invoices_cash_receipt_id_fkey"
  FOREIGN KEY ("cash_receipt_id") REFERENCES "cash_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tax_invoices"
  ADD CONSTRAINT "tax_invoices_replaces_tax_invoice_id_fkey"
  FOREIGN KEY ("replaces_tax_invoice_id") REFERENCES "tax_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ②③ เติมข้อมูลใบเดิม (ข้อมูลเก่า — INV-0001… ใน dev) จากค่าปัจจุบัน — ปิดยาม immutable ชั่วคราวใน migration นี้เท่านั้น
ALTER TABLE "tax_invoices" DISABLE TRIGGER trg_tax_invoices_no_update;

UPDATE "tax_invoices" t
   SET amount_before_vat_satang = s.total_before_vat_satang,
       vat_satang               = s.vat_satang,
       total_satang             = s.total_satang,
       description              = 'ค่าบริการติดตามทรัพย์ รอบเดือน ' || btrim(b.period)
  FROM "sales_records" s
  JOIN "billing_batches" b ON b.id = s.billing_batch_id
 WHERE s.id = t.sales_record_id;

-- อัตรา VAT: รายได้ของรอบมีอัตราเดียว ⇒ เก็บอัตรานั้น · หลายอัตรา ⇒ NULL (พิมพ์หัวคอลัมน์ไม่ระบุ %)
UPDATE "tax_invoices" t
   SET vat_rate_pct_used = r.rate
  FROM (
    SELECT s.id AS sales_record_id, MIN(rv.vat_rate_pct_used) AS rate
      FROM "sales_records" s
      JOIN "revenues" rv ON rv.billing_batch_id = s.billing_batch_id AND rv.deleted_at IS NULL
     GROUP BY s.id
    HAVING COUNT(DISTINCT rv.vat_rate_pct_used) = 1
  ) r
 WHERE r.sales_record_id = t.sales_record_id;

UPDATE "tax_invoices" t
   SET seller_name    = o.name,
       seller_tax_id  = o.tax_id,
       seller_address = o.address,
       seller_phone   = o.phone
  FROM "organizations" o
 WHERE o.id = t.organization_id;

UPDATE "tax_invoices" t
   SET buyer_name      = c.name,
       buyer_tax_id    = c.tax_id,
       buyer_address   = COALESCE(c.address, ''),
       buyer_phone     = c.phone,
       delivery_format = c.default_invoice_delivery_format
  FROM "sales_records" s
  JOIN "finance_companies" c ON c.id = s.company_id
 WHERE s.id = t.sales_record_id;

ALTER TABLE "tax_invoices" ENABLE TRIGGER trg_tax_invoices_no_update;

ALTER TABLE "tax_invoices"
  ALTER COLUMN "doc_kind" DROP DEFAULT,
  ALTER COLUMN "amount_before_vat_satang" SET NOT NULL,
  ALTER COLUMN "vat_satang" SET NOT NULL,
  ALTER COLUMN "total_satang" SET NOT NULL,
  ALTER COLUMN "seller_name" SET NOT NULL,
  ALTER COLUMN "seller_tax_id" SET NOT NULL,
  ALTER COLUMN "seller_address" SET NOT NULL,
  ALTER COLUMN "buyer_name" SET NOT NULL,
  ALTER COLUMN "buyer_tax_id" SET NOT NULL,
  ALTER COLUMN "buyer_address" SET NOT NULL,
  ALTER COLUMN "delivery_format" SET NOT NULL,
  ALTER COLUMN "description" SET NOT NULL;

ALTER TABLE "tax_invoices" ADD CONSTRAINT "chk_tax_invoices_amounts"
  CHECK (total_satang = amount_before_vat_satang + vat_satang AND amount_before_vat_satang >= 0 AND vat_satang >= 0);

-- ใบเสร็จรับเงิน/ใบกำกับภาษี ต้องเกิดจากเงินรับ (ตอนสร้าง) · ใบแบบเดิมไม่มีเงินรับ
ALTER TABLE "tax_invoices" ADD CONSTRAINT "chk_tax_invoices_receipt_kind"
  CHECK (doc_kind = 'receipt_tax_invoice' OR cash_receipt_id IS NULL);

-- ⑤ partial unique — ใบแบบเดิม 1 ใบ active ต่อรายการขาย · ใบเสร็จรับเงิน/ใบกำกับภาษี 1 ใบ active ต่อเงินรับ
DROP INDEX IF EXISTS uniq_tax_invoice_active_per_sales;
CREATE UNIQUE INDEX uniq_tax_invoice_active_per_sales
  ON tax_invoices (organization_id, sales_record_id)
  WHERE status = 'active' AND doc_kind = 'tax_invoice';
CREATE UNIQUE INDEX uniq_tax_invoice_active_per_receipt
  ON tax_invoices (cash_receipt_id)
  WHERE status = 'active' AND cash_receipt_id IS NOT NULL;
-- ใบเดิม 1 ใบถูกออกแทนได้ครั้งเดียว
CREATE UNIQUE INDEX uniq_tax_invoice_replaces
  ON tax_invoices (replaces_tax_invoice_id)
  WHERE replaces_tax_invoice_id IS NOT NULL;
CREATE INDEX idx_tax_invoices_cash_receipt ON tax_invoices (cash_receipt_id);

-- ยาม immutable (`02` §13) — แก้ได้ทางเดียวคือยกเลิก · ข้อยกเว้นเดียว: FK `ON DELETE SET NULL` ของเงินรับ
-- ที่ถูกถอน (เฉพาะใบที่ยกเลิกแล้ว และเปลี่ยนแค่ `cash_receipt_id` → NULL)
CREATE OR REPLACE FUNCTION tax_invoices_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % ลบไม่ได้ — ยกเลิกเท่านั้น (31 §9.1 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  IF OLD.status = 'cancelled' THEN
    IF NEW.cash_receipt_id IS NULL AND OLD.cash_receipt_id IS NOT NULL
       AND (to_jsonb(NEW) - 'cash_receipt_id') = (to_jsonb(OLD) - 'cash_receipt_id') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % ถูกยกเลิกแล้ว ห้ามแก้/ห้าม reverse (31 §9.1 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'cancelled'
     OR (to_jsonb(NEW) - 'status' - 'cancel_reason' - 'cancelled_by' - 'cancelled_at')
        <> (to_jsonb(OLD) - 'status' - 'cancel_reason' - 'cancelled_by' - 'cancelled_at') THEN
    RAISE EXCEPTION 'TAX_INVOICE_IMMUTABLE: ใบกำกับภาษี % แก้ได้ทางเดียวคือยกเลิก (31 §10 / 02 §13)',
      OLD.invoice_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ยอดใบลดหนี้ห้ามเกินยอดของ**ใบที่อ้างถึง** (ใบเสร็จรับเงิน/ใบกำกับภาษีหลายใบต่อรอบ ⇒ อ่านยอดจากใบเอง)
CREATE OR REPLACE FUNCTION credit_notes_guard_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inv_status tax_invoice_status;
  inv_org UUID;
  inv_before_vat INTEGER;
  inv_total INTEGER;
  used_before_vat BIGINT;
  used_total BIGINT;
BEGIN
  SELECT t.status, t.organization_id, t.amount_before_vat_satang, t.total_satang
    INTO inv_status, inv_org, inv_before_vat, inv_total
    FROM tax_invoices t
   WHERE t.id = NEW.tax_invoice_id
     FOR UPDATE OF t;

  IF inv_org IS NULL OR inv_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'CREDIT_NOTE_INVOICE_MISMATCH: ใบกำกับ % ไม่อยู่ในองค์กรเดียวกับเอกสาร', NEW.tax_invoice_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'active' AND inv_status <> 'active' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_INVOICE_CANCELLED: ใบกำกับ % ถูกยกเลิกแล้ว บันทึกเอกสารอ้างถึงไม่ได้', NEW.tax_invoice_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.note_type <> 'credit' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount_before_vat_satang), 0), COALESCE(SUM(total_satang), 0)
    INTO used_before_vat, used_total
    FROM credit_notes
   WHERE tax_invoice_id = NEW.tax_invoice_id AND status = 'active' AND note_type = 'credit';

  IF NEW.status = 'active'
     AND (used_before_vat + NEW.amount_before_vat_satang > inv_before_vat
          OR used_total + NEW.total_satang > inv_total) THEN
    RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_INVOICE: ยอดใบลดหนี้รวมเกินยอดใบกำกับ %', NEW.tax_invoice_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

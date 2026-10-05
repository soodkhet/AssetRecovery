-- มติ PO 05/10/2569 (UAT U19) — บันทึก**ใบเพิ่มหนี้** (ม.86/9) ในโครงเดียวกับใบลดหนี้ (U14)
--
-- เลือก "เพิ่มคอลัมน์ `note_type`" แทนการเปลี่ยนชื่อตาราง ⇒ ปลอดภัยกับข้อมูลเดิม:
--   · แถวเดิมทุกแถวได้ `credit` จาก DEFAULT (ไม่มีการย้าย/คัดลอกข้อมูล · FK/index/trigger เดิมอยู่ครบ)
--   · โค้ดที่อ่านตารางนี้อยู่แล้วต้องกรอง `note_type` เอง (ทำพร้อม commit นี้)
--
-- กติกาที่เปลี่ยน:
--   ① ใบเพิ่มหนี้**ไม่มีเพดาน**ยอดใบกำกับ (ยอด > 0 ตาม CHECK เดิม) — trigger ยอดเกินตรวจเฉพาะใบลดหนี้ และนับ
--      เฉพาะใบลดหนี้ active (เพดานใบลดหนี้ = ยอดหน้าใบกำกับเดิม ไม่นับใบเพิ่มหนี้ — conservative: ยกเลิก
--      ใบเพิ่มหนี้ทีหลังแล้วยอดลดหนี้จะไม่ทะลุใบกำกับ)
--   ② เลขที่ไม่ซ้ำต่อ (องค์กร, ชนิด) — ใบลดหนี้/ใบเพิ่มหนี้มักใช้ชุดเลขคนละชุด
--   ③ `note_type` แก้ไม่ได้ (immutable trigger)
--   ④ ใบกำกับที่ยกเลิกแล้ว: ทั้งสองชนิดอ้างถึงไม่ได้ (ตรวจเหมือนเดิม)

-- CreateEnum
CREATE TYPE "credit_note_type" AS ENUM ('credit', 'debit');

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN "note_type" "credit_note_type" NOT NULL DEFAULT 'credit';

-- ② เลขที่ไม่ซ้ำต่อชนิด
DROP INDEX "uniq_credit_notes_active_number";
CREATE UNIQUE INDEX "uniq_credit_notes_active_number"
  ON "credit_notes"("organization_id", "note_type", "credit_note_number") WHERE "status" = 'active';

-- ① ยอดห้ามเกินใบกำกับ — เฉพาะใบลดหนี้
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
  -- ล็อกแถวใบกำกับก่อนรวมยอด ⇒ คำขอพร้อมกันต่อคิวกัน (FOR UPDATE ไม่ปลุก trigger ของ tax_invoices)
  SELECT t.status, t.organization_id, s.total_before_vat_satang, s.total_satang
    INTO inv_status, inv_org, inv_before_vat, inv_total
    FROM tax_invoices t
    JOIN sales_records s ON s.id = t.sales_record_id
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

  -- ใบเพิ่มหนี้ไม่มีเพดาน
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

-- ③ immutable (+ note_type)
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
     OR NEW.reason <> OLD.reason
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256 THEN
    RAISE EXCEPTION 'CREDIT_NOTE_IMMUTABLE: เอกสาร % แก้ได้ทางเดียวคือยกเลิก', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

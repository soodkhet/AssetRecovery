-- มติ PO 05/10/2569 (UAT U14) + มติบัญชี B1 — บันทึกใบลดหนี้ที่สำนักงานบัญชีออกนอกระบบ (ม.86/10)
--
-- ระบบ **ไม่ออก** ใบลดหนี้เอง (Hybrid Accounting Boundary) — ตารางนี้เก็บข้อมูลของเอกสารที่ออกจริงแล้ว
-- (เลขที่/วันที่/ใบกำกับที่อ้างถึง/มูลค่าลดก่อน VAT/VAT ที่ลด/เหตุผล/ไฟล์สแกน) เพื่อให้ portal และ
-- ชุดเอกสารบัญชีสะท้อนยอดตามเอกสารที่ออกให้ลูกค้าจริง
--
-- กติกาที่บังคับถึงระดับ DB (Rule 02 — Prisma เขียน CHECK / partial index / trigger ไม่ได้):
--   ① ยอดก่อน VAT > 0 · VAT ≥ 0 · total = ก่อน VAT + VAT
--   ② สถานะ cancelled ⇔ มีเหตุผล + ผู้ยกเลิก + เวลา
--   ③ เลขที่ใบลดหนี้ไม่ซ้ำต่อองค์กร (เฉพาะใบที่ active — ใบที่ยกเลิกเพราะกรอกผิดบันทึกเลขเดิมใหม่ได้)
--   ④ 1 Adjustment มีใบลดหนี้ active ได้ใบเดียว
--   ⑤ ยอดรวมใบลดหนี้ active ของใบกำกับหนึ่งใบ ห้ามเกินยอดของใบกำกับ (ก่อน VAT และยอดรวม) —
--      trigger ล็อกแถวใบกำกับ (`FOR UPDATE`) ก่อนรวมยอด ⇒ บันทึกพร้อมกันสองคำขอไม่ทะลุยอด
--   ⑥ ห้าม DELETE · แก้ได้ทางเดียวคือยกเลิก · ใบที่ยกเลิกแล้วห้ามแก้/ห้าม reverse (แนวเดียวกับ tax_invoices)

-- CreateEnum
CREATE TYPE "credit_note_status" AS ENUM ('active', 'cancelled');

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "tax_invoice_id" UUID NOT NULL,
    "adjustment_id" UUID,
    "credit_note_number" VARCHAR(50) NOT NULL,
    "issue_date" DATE NOT NULL,
    "amount_before_vat_satang" INTEGER NOT NULL,
    "vat_satang" INTEGER NOT NULL,
    "total_satang" INTEGER NOT NULL,
    "vat_rate_used" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "file_path" TEXT,
    "file_sha256" VARCHAR(64),
    "status" "credit_note_status" NOT NULL DEFAULT 'active',
    "cancel_reason" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_credit_notes_amount_positive" CHECK ("amount_before_vat_satang" > 0),
    CONSTRAINT "chk_credit_notes_vat_non_negative" CHECK ("vat_satang" >= 0),
    CONSTRAINT "chk_credit_notes_total" CHECK ("total_satang" = "amount_before_vat_satang" + "vat_satang"),
    CONSTRAINT "chk_credit_notes_vat_rate" CHECK ("vat_rate_used" >= 0 AND "vat_rate_used" <= 100),
    CONSTRAINT "chk_credit_notes_number_not_blank" CHECK (btrim("credit_note_number") <> ''),
    CONSTRAINT "chk_credit_notes_reason_not_blank" CHECK (btrim("reason") <> ''),
    CONSTRAINT "chk_credit_notes_cancel_fields" CHECK (
      ("status" = 'active' AND "cancel_reason" IS NULL AND "cancelled_by" IS NULL AND "cancelled_at" IS NULL)
      OR ("status" = 'cancelled' AND "cancel_reason" IS NOT NULL AND btrim("cancel_reason") <> ''
          AND "cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "idx_credit_notes_org_invoice" ON "credit_notes"("organization_id", "tax_invoice_id");
CREATE INDEX "idx_credit_notes_org_issue_date" ON "credit_notes"("organization_id", "issue_date");
CREATE INDEX "idx_credit_notes_org_adjustment" ON "credit_notes"("organization_id", "adjustment_id");

-- ③ / ④ partial unique
CREATE UNIQUE INDEX "uniq_credit_notes_active_number"
  ON "credit_notes"("organization_id", "credit_note_number") WHERE "status" = 'active';
CREATE UNIQUE INDEX "uniq_credit_notes_active_adjustment"
  ON "credit_notes"("adjustment_id") WHERE "status" = 'active' AND "adjustment_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tax_invoice_id_fkey" FOREIGN KEY ("tax_invoice_id") REFERENCES "tax_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ⑤ ยอดห้ามเกินใบกำกับ (insert) — ยอดของใบกำกับ = รายการขายที่ใบนั้นผูกอยู่ (`sales_records` snapshot)
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
    RAISE EXCEPTION 'CREDIT_NOTE_INVOICE_MISMATCH: ใบกำกับ % ไม่อยู่ในองค์กรเดียวกับใบลดหนี้', NEW.tax_invoice_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'active' AND inv_status <> 'active' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_INVOICE_CANCELLED: ใบกำกับ % ถูกยกเลิกแล้ว บันทึกใบลดหนี้อ้างถึงไม่ได้', NEW.tax_invoice_id
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(amount_before_vat_satang), 0), COALESCE(SUM(total_satang), 0)
    INTO used_before_vat, used_total
    FROM credit_notes
   WHERE tax_invoice_id = NEW.tax_invoice_id AND status = 'active';

  IF NEW.status = 'active'
     AND (used_before_vat + NEW.amount_before_vat_satang > inv_before_vat
          OR used_total + NEW.total_satang > inv_total) THEN
    RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_INVOICE: ยอดใบลดหนี้รวมเกินยอดใบกำกับ %', NEW.tax_invoice_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_credit_notes_balance
  BEFORE INSERT ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION credit_notes_guard_balance();

-- ⑥ immutable
CREATE OR REPLACE FUNCTION credit_notes_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_IMMUTABLE: ใบลดหนี้ % ลบไม่ได้ — ยกเลิกเท่านั้น', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_IMMUTABLE: ใบลดหนี้ % ถูกยกเลิกแล้ว ห้ามแก้/ห้าม reverse', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'cancelled'
     OR NEW.organization_id <> OLD.organization_id
     OR NEW.tax_invoice_id <> OLD.tax_invoice_id
     OR NEW.adjustment_id IS DISTINCT FROM OLD.adjustment_id
     OR NEW.credit_note_number <> OLD.credit_note_number
     OR NEW.issue_date <> OLD.issue_date
     OR NEW.amount_before_vat_satang <> OLD.amount_before_vat_satang
     OR NEW.vat_satang <> OLD.vat_satang
     OR NEW.total_satang <> OLD.total_satang
     OR NEW.vat_rate_used <> OLD.vat_rate_used
     OR NEW.reason <> OLD.reason
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256 THEN
    RAISE EXCEPTION 'CREDIT_NOTE_IMMUTABLE: ใบลดหนี้ % แก้ได้ทางเดียวคือยกเลิก', OLD.credit_note_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_credit_notes_no_update
  BEFORE UPDATE ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION credit_notes_immutable();

CREATE TRIGGER trg_credit_notes_no_delete
  BEFORE DELETE ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION credit_notes_immutable();

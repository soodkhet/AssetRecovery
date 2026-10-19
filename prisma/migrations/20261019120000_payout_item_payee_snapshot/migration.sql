-- มติ D7-07 (mytester7 FX3) — snapshot ผู้รับเงินบนเอกสารการจ่าย (ใบสำคัญจ่าย · สลิปค่าตอบแทน · สรุปรอบจ่าย)
-- เขียนตอนสร้างไฟล์โอนครั้งแรก ในทรานแซกชันเดียวกับการออกเลขใบสำคัญจ่าย (สร้างไฟล์ซ้ำคงชุดเดิม)
-- รอบที่สร้างไฟล์ก่อน migration นี้ = NULL ⇒ เอกสารใช้ข้อมูลผู้รับปัจจุบันตามเดิม (ไม่ backfill โดยเจตนา)

ALTER TABLE "payout_batch_items"
  ADD COLUMN "payee_snapshot_at" TIMESTAMPTZ(6),
  ADD COLUMN "payee_name_snapshot" TEXT,
  ADD COLUMN "payee_name_title_snapshot" VARCHAR(50),
  ADD COLUMN "payee_type_snapshot" "payee_type",
  ADD COLUMN "payee_tax_id_snapshot" VARCHAR(13),
  ADD COLUMN "payee_address_snapshot" TEXT,
  ADD COLUMN "payee_branch_code_snapshot" VARCHAR(5);

-- ครบชุด ⇔ มีเวลา snapshot (ชื่อ + ประเภทบังคับ · เลข/ที่อยู่/สาขาว่างได้ตามโปรไฟล์ ณ ตอนออก)
ALTER TABLE "payout_batch_items"
  ADD CONSTRAINT "chk_payout_batch_items_payee_snapshot"
  CHECK (
    ("payee_snapshot_at" IS NULL
      AND "payee_name_snapshot" IS NULL
      AND "payee_name_title_snapshot" IS NULL
      AND "payee_type_snapshot" IS NULL
      AND "payee_tax_id_snapshot" IS NULL
      AND "payee_address_snapshot" IS NULL
      AND "payee_branch_code_snapshot" IS NULL)
    OR ("payee_snapshot_at" IS NOT NULL
      AND "payee_name_snapshot" IS NOT NULL
      AND "payee_type_snapshot" IS NOT NULL)
  );

-- เขียนครั้งเดียว — snapshot ที่ตั้งแล้วแก้/ล้างไม่ได้ (เอกสารที่ออกแล้วต้องไม่เปลี่ยนย้อนหลัง)
CREATE OR REPLACE FUNCTION payout_batch_items_payee_snapshot_write_once()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."payee_snapshot_at" IS NOT NULL AND (
       NEW."payee_snapshot_at" IS DISTINCT FROM OLD."payee_snapshot_at"
    OR NEW."payee_name_snapshot" IS DISTINCT FROM OLD."payee_name_snapshot"
    OR NEW."payee_name_title_snapshot" IS DISTINCT FROM OLD."payee_name_title_snapshot"
    OR NEW."payee_type_snapshot" IS DISTINCT FROM OLD."payee_type_snapshot"
    OR NEW."payee_tax_id_snapshot" IS DISTINCT FROM OLD."payee_tax_id_snapshot"
    OR NEW."payee_address_snapshot" IS DISTINCT FROM OLD."payee_address_snapshot"
    OR NEW."payee_branch_code_snapshot" IS DISTINCT FROM OLD."payee_branch_code_snapshot"
  ) THEN
    RAISE EXCEPTION 'ข้อมูลผู้รับเงินบนเอกสารการจ่ายที่ออกแล้วแก้ไขไม่ได้' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payout_batch_items_payee_snapshot_write_once
  BEFORE UPDATE OF
    "payee_snapshot_at", "payee_name_snapshot", "payee_name_title_snapshot", "payee_type_snapshot",
    "payee_tax_id_snapshot", "payee_address_snapshot", "payee_branch_code_snapshot"
  ON "payout_batch_items"
  FOR EACH ROW EXECUTE FUNCTION payout_batch_items_payee_snapshot_write_once();

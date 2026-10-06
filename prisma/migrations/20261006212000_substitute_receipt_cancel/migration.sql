-- ยกเลิกใบรับรองแทนใบเสร็จรับเงิน (มติ PO 06/10/2569 U107 · `23` §6.17 · `15` §9.4 · `41` §6.6 · `02` v4.44)
--
-- 1) cancelled_at / cancelled_by / cancel_reason — CHECK ครบทั้งชุด ⇔ status = cancelled · เหตุผลไม่ว่าง
-- 2) ไฟล์ฉบับเซ็น: มีครบหรือไม่มีเลย · signed ⇒ มีไฟล์ · pending ⇒ ไม่มีไฟล์ · cancelled ได้ทั้งสองแบบ
--    (ยกเลิกหลังอัปโหลดฉบับเซ็น — เก็บไฟล์เดิมไว้เป็นหลักฐาน)
-- 3) trigger immutable: เปลี่ยนเป็น cancelled ได้ครั้งเดียวจาก pending_signature/signed · cancelled แล้วแก้อะไรไม่ได้
--    · ห้าม soft delete ใบที่ออกแล้ว (ใช้การยกเลิกแทน) · ห้ามลบแถวที่ยกเลิกแล้ว
-- 4) unique ต่อใบเบิก/เงินทดรอง เป็น partial ที่ status <> 'cancelled' ⇒ ออกใบใหม่แทนได้

ALTER TABLE "substitute_receipts"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_by" UUID,
  ADD COLUMN "cancel_reason" TEXT;

ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_cancelled_by_fkey"
  FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "substitute_receipts" ADD CONSTRAINT "chk_substitute_receipts_cancel_shape" CHECK (
  (status = 'cancelled') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)
);
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "chk_substitute_receipts_cancel_reason" CHECK (
  cancel_reason IS NULL OR length(btrim(cancel_reason)) > 0
);

ALTER TABLE "substitute_receipts" DROP CONSTRAINT "chk_substitute_receipts_signed_shape";
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "chk_substitute_receipts_signed_shape" CHECK (
  (signed_file_path IS NOT NULL AND signed_file_sha256 IS NOT NULL AND signed_at IS NOT NULL AND signed_by IS NOT NULL)
  OR (signed_file_path IS NULL AND signed_file_sha256 IS NULL AND signed_at IS NULL AND signed_by IS NULL)
);
ALTER TABLE "substitute_receipts" ADD CONSTRAINT "chk_substitute_receipts_signed_status" CHECK (
  (status = 'signed' AND signed_file_path IS NOT NULL)
  OR (status = 'pending_signature' AND signed_file_path IS NULL)
  OR status = 'cancelled'
);

-- ใบที่ยกเลิกแล้วไม่กันการออกใบใหม่ให้ใบเบิก/เงินทดรองเดิม
DROP INDEX "uniq_substitute_receipts_expense";
DROP INDEX "uniq_substitute_receipts_advance";
CREATE UNIQUE INDEX "uniq_substitute_receipts_expense" ON "substitute_receipts"("expense_id")
  WHERE expense_id IS NOT NULL AND deleted_at IS NULL AND status <> 'cancelled';
CREATE UNIQUE INDEX "uniq_substitute_receipts_advance" ON "substitute_receipts"("advance_id")
  WHERE advance_id IS NOT NULL AND deleted_at IS NULL AND status <> 'cancelled';

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

  -- U107: ยกเลิกแล้ว = terminal — ห้ามเปลี่ยนสถานะ/ไฟล์/ข้อมูลการยกเลิก/ลบ
  IF OLD.status = 'cancelled' AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.signed_file_path IS DISTINCT FROM OLD.signed_file_path
       OR NEW.signed_file_sha256 IS DISTINCT FROM OLD.signed_file_sha256
       OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
       OR NEW.signed_by IS DISTINCT FROM OLD.signed_by
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
       OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'ใบรับรองแทนใบเสร็จ % ถูกยกเลิกแล้ว แก้ไขไม่ได้', OLD.receipt_number USING ERRCODE = '23514';
  END IF;

  -- ข้อมูลการยกเลิกมีได้เฉพาะสถานะ cancelled
  IF NEW.status IS DISTINCT FROM 'cancelled' AND (
       NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.cancel_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'ใบรับรองแทนใบเสร็จ % ยังไม่ถูกยกเลิก', OLD.receipt_number USING ERRCODE = '23514';
  END IF;

  -- ฉบับเซ็นแล้ว: ไฟล์เปลี่ยนไม่ได้ · สถานะไปได้ทางเดียวคือ cancelled (ไฟล์เดิมคงอยู่)
  IF OLD.status = 'signed' AND (
       (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'cancelled')
       OR NEW.signed_file_path IS DISTINCT FROM OLD.signed_file_path
       OR NEW.signed_file_sha256 IS DISTINCT FROM OLD.signed_file_sha256
       OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
       OR NEW.signed_by IS DISTINCT FROM OLD.signed_by) THEN
    RAISE EXCEPTION 'ใบรับรองแทนใบเสร็จ % อัปโหลดฉบับเซ็นแล้ว เปลี่ยนไฟล์ไม่ได้', OLD.receipt_number USING ERRCODE = '23514';
  END IF;

  -- ใบที่ออกแล้วห้ามลบ (soft delete) — ใช้การยกเลิกแทน (U107)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ใบรับรองแทนใบเสร็จ % ห้ามลบ — ใช้การยกเลิกแทน', OLD.receipt_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- ห้ามลบแถวที่ยกเลิกแล้ว (หลักฐานการยกเลิกต้องอยู่ครบ) — แถวอื่นลบได้เฉพาะ cascade ตามใบเบิก/เงินทดรอง
CREATE OR REPLACE FUNCTION substitute_receipts_guard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'ใบรับรองแทนใบเสร็จ % ถูกยกเลิกแล้ว ห้ามลบ', OLD.receipt_number USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_substitute_receipts_guard_delete
  BEFORE DELETE ON substitute_receipts
  FOR EACH ROW EXECUTE FUNCTION substitute_receipts_guard_delete();

-- ใบรับรองแทนใบเสร็จ "ออกแทนเลขที่ …" (มติ PO 06/10/2569 U117 ข้อ 2 · `02` v4.46)
--
-- 1) replaces_receipt_id — ใบที่ออกใหม่แทนใบที่ยกเลิก (NULL = ใบออกครั้งแรก) · อ้างใบในองค์กรเดียวกันที่ผูกรายการเดียวกัน
--    (ตรวจที่ service) · ห้ามอ้างตัวเอง · 1 ใบที่ยกเลิกถูกแทนได้ครั้งเดียว (partial unique)
-- 2) trigger immutable: replaces_receipt_id ห้ามแก้หลังออกใบ (เหมือนเลข/การผูก/ยอด)
-- ใบเก่าก่อน migration นี้ = NULL (ร่องรอยการออกแทนยังอยู่ใน audit `substitute_receipt.reissued`)

ALTER TABLE "substitute_receipts" ADD COLUMN "replaces_receipt_id" UUID;

ALTER TABLE "substitute_receipts" ADD CONSTRAINT "substitute_receipts_replaces_receipt_id_fkey"
  FOREIGN KEY ("replaces_receipt_id") REFERENCES "substitute_receipts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "substitute_receipts" ADD CONSTRAINT "chk_substitute_receipts_replaces_not_self" CHECK (
  replaces_receipt_id IS NULL OR replaces_receipt_id <> id
);

CREATE UNIQUE INDEX "uniq_substitute_receipts_replaces" ON "substitute_receipts"("replaces_receipt_id")
  WHERE replaces_receipt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION substitute_receipts_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.payee_id IS DISTINCT FROM OLD.payee_id
     OR NEW.expense_id IS DISTINCT FROM OLD.expense_id
     OR NEW.advance_id IS DISTINCT FROM OLD.advance_id
     OR NEW.replaces_receipt_id IS DISTINCT FROM OLD.replaces_receipt_id
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


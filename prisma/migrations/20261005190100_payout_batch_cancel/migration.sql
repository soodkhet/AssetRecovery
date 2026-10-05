-- ยกเลิกรอบจ่าย — มติ PO 05/10/2569 (UAT U67) · `23` §6.6 · `17` §9.1
-- ยกเลิกได้เฉพาะก่อนโอนจริง (draft/checking/file_generated) · เหตุผลบังคับ · terminal
-- ผลข้างเคียง (รายการกลับไปรอจ่าย / หักคืนเงินทดรองกลับเป็นค้าง) ทำที่ service ในทรานแซกชันเดียว

-- AlterTable — ผู้ยกเลิก/เวลา/เหตุผล (แสดงบนรายการ ไม่ต้องเปิด audit)
ALTER TABLE "payout_batches" ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN "cancelled_by" UUID,
ADD COLUMN "cancel_reason" TEXT;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK — ข้อมูลการยกเลิกครบทั้ง 3 ช่องเมื่อ (และเฉพาะเมื่อ) สถานะเป็น cancelled
ALTER TABLE "payout_batches" ADD CONSTRAINT "chk_payout_batches_cancelled_fields" CHECK (
  (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
     AND cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) > 0)
  OR (status <> 'cancelled' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
);

-- Trigger — ด่านสุดท้ายของ state machine ระดับ DB
--   ① รอบที่ completed (โอนแล้ว) ห้ามกลายเป็น cancelled — ต้องแก้ผ่าน Adjustment
--   ② รอบที่ cancelled เป็น terminal — ห้ามเปลี่ยนสถานะ/ยอดเงิน/คีย์กันโอนซ้ำ/ข้อมูลการยกเลิก
CREATE OR REPLACE FUNCTION payout_batches_cancel_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'PAYOUT_BATCH_ALREADY_PAID: รอบจ่าย % จ่ายสำเร็จแล้ว ยกเลิกไม่ได้', OLD.name
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'cancelled' AND (
       NEW.status <> OLD.status
       OR NEW.gross_satang <> OLD.gross_satang
       OR NEW.wht_satang <> OLD.wht_satang
       OR NEW.net_satang <> OLD.net_satang
       OR NEW.advance_offset_satang <> OLD.advance_offset_satang
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
       OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason
     ) THEN
    RAISE EXCEPTION 'PAYOUT_BATCH_CANCELLED_IMMUTABLE: รอบจ่าย % ถูกยกเลิกแล้ว ห้ามแก้ไข', OLD.name
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION payout_batches_cancel_guard() IS
  'ยามการยกเลิกรอบจ่าย (มติ PO U67): completed → cancelled ไม่ได้ · cancelled เป็น terminal';

DROP TRIGGER IF EXISTS trg_payout_batches_cancel_guard ON payout_batches;

CREATE TRIGGER trg_payout_batches_cancel_guard
  BEFORE UPDATE ON payout_batches
  FOR EACH ROW WHEN (OLD.status IN ('completed', 'cancelled'))
  EXECUTE FUNCTION payout_batches_cancel_guard();

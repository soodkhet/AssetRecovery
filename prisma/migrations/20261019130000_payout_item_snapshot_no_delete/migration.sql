-- mytester7 FX review (security info) — snapshot ผู้รับเงินของรายการรอบจ่าย (มติ D7-07) เขียนครั้งเดียวแล้ว
-- แต่ trigger เดิมกันแค่ UPDATE ⇒ ลบแถวที่มี snapshot แล้ว (เอกสารการจ่ายออกแล้ว) ก็ทำให้หลักฐานหายได้
-- แอปไม่มีเส้นทางลบ payout_batch_items (ยกเลิกรอบ = เปลี่ยนสถานะ · รอบจ่ายลบแบบ soft delete) ⇒ ปฏิเสธการลบทุกกรณี
-- เมื่อ payee_snapshot_at ถูกตั้งแล้ว (รวม cascade จากการลบ payout_batches แบบ hard delete)
-- เครื่องมือ reset ข้อมูลทดสอบปิด trigger ทั้งตารางก่อนลบอยู่แล้ว (DISABLE TRIGGER USER)

CREATE OR REPLACE FUNCTION payout_batch_items_payee_snapshot_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."payee_snapshot_at" IS NOT NULL THEN
    RAISE EXCEPTION 'รายการรอบจ่ายที่ออกเอกสารการจ่ายแล้วลบไม่ได้' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_payout_batch_items_payee_snapshot_no_delete
  BEFORE DELETE ON "payout_batch_items"
  FOR EACH ROW EXECUTE FUNCTION payout_batch_items_payee_snapshot_no_delete();

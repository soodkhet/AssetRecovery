-- ยกเลิกรอบจ่าย — มติ PO 05/10/2569 (UAT U67)
-- เพิ่มสถานะ terminal `cancelled` ให้ payout_batch_status (`23` §6.6 · `02` §3)
-- แยก migration: ค่า enum ใหม่ใช้ใน CHECK/trigger ได้หลัง commit แล้วเท่านั้น (Postgres "unsafe use of new value")

-- AlterEnum
ALTER TYPE "payout_batch_status" ADD VALUE 'cancelled';

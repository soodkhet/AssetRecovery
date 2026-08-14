-- Phase 1.8 (มติ PO 14/08/2569) — เติม 2 คอลัมน์ที่ไฟล์ `10` §7.1 ต้องใช้แต่ `02` §5 ตกหล่น
--   1) suspended_reason                — เหตุผลระงับบริษัท (`10` §9.3/§11 SUSPEND_REASON_REQUIRED)
--   2) default_invoice_delivery_format — รูปแบบส่งใบกำกับภาษีเริ่มต้น (`10` §7.1 · เปลี่ยนต่อใบได้ที่ `31` §6.2)
--
-- ⚠️ เขียนมือหลัง `migrate dev --create-only` — ไฟล์ที่ Prisma generate มามีคำสั่งพยศ 2 ชุดที่ต้องตัดทิ้ง
--    (กับดักที่บันทึกไว้ใน REUSE_INDEX): `ALTER COLUMN updated_at DROP DEFAULT` ทุกตาราง (ล้าง
--    migration `20260813220500_updated_at_db_default`) และ `ALTER COLUMN return_satang SET NOT NULL`
--    ของ `advances` ซึ่งเป็น generated column (Prisma ไม่รู้จัก) — ห้ามใส่กลับเข้ามาเด็ดขาด

-- CreateEnum
CREATE TYPE "invoice_delivery_format" AS ENUM ('e_tax_invoice', 'paper_pdf');

-- AlterTable
ALTER TABLE "finance_companies"
  ADD COLUMN "suspended_reason" TEXT,
  ADD COLUMN "default_invoice_delivery_format" "invoice_delivery_format" NOT NULL DEFAULT 'paper_pdf';

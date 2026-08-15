-- Phase 8.3 (Final Test ด่าน 2/6) — 1 รายการขาย = ใบกำกับภาษีที่ `active` ได้ใบเดียว (`31` §9.1)
--
-- ### ปัญหา
-- `issueTaxInvoice()` เช็ค `assertIssuable()` จากค่าที่อ่าน **นอก** `$transaction` แล้วในทรานแซกชัน
-- ไม่เช็คซ้ำ (`FOR UPDATE` ที่นั่นล็อกแถว `organizations` เพื่อเดินเลขเท่านั้น ไม่ได้ล็อกรายการขาย)
-- และ `tax_invoices` มี unique แค่ที่ `invoice_number` ⇒ ยิง `POST /api/accounting/tax-invoices`
-- ด้วย `sales_record_id` เดิมพร้อมกัน (ดับเบิลคลิก / retry / เปิดสองแท็บ) ⇒ ได้ใบกำกับภาษี
-- **active สองใบ สองเลขที่** สำหรับยอดขายก้อนเดียว ⇒ ทะเบียนภาษีขายนับซ้ำ ยื่น ภ.พ.30 เกินจริง
-- และแก้ย้อนหลังได้แค่ยกเลิกใบ (`cancelled` เป็น terminal — `02` §13 ห้ามลบ)
--
-- ### ทางแก้
-- partial unique index บน `(organization_id, sales_record_id) WHERE status = 'active'` — สะท้อน
-- กติกาที่ `assertIssuable()` บังคับอยู่แล้วเป๊ะ จึงไม่เปลี่ยนความหมายของระบบ · ใบที่ `cancelled`
-- ไม่ถูกนับ ⇒ ยกเลิกแล้วออกใบใหม่ยังทำได้ตามปกติ และใบเก่ายังอยู่ครบ (เลขที่ห้ามขาดช่วง)
--
-- Prisma เขียน partial index (`WHERE`) ใน `schema.prisma` ไม่ได้ ⇒ raw SQL ตาม Rule 02
-- (แนวเดียวกับ `20260816030000_wht_certificate_active_unique` ของก้อนงานเดียวกัน)
--
-- ⚠️ ถ้าฐานปลายทางมีใบ `active` ซ้ำค้างอยู่ก่อน migration นี้จะล้ม (ตั้งใจ) — ต้องยกเลิกใบส่วนเกิน
--    ด้วยมือผ่าน `cancelTaxInvoice()` (พร้อมเหตุผล) ก่อน ห้ามให้ migration ลบใบเอง

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tax_invoice_active_per_sales
  ON tax_invoices (organization_id, sales_record_id)
  WHERE status = 'active';

COMMENT ON INDEX uniq_tax_invoice_active_per_sales IS
  'Phase 8.3 — 1 รายการขายมีใบกำกับภาษีที่ active ได้ใบเดียว (`31` §9.1) · ใบ cancelled ไม่นับ';

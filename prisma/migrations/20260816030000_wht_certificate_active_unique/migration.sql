-- Phase 8.3 (Final Test ด่าน 3/6) — 1 บัญชีค่าใช้จ่าย = ใบ 50 ทวิ ที่ `active` ได้ใบเดียว (`33` §9)
--
-- ### ปัญหา
-- `syncWhtCertificatesFromPayout()` กันออกใบซ้ำด้วย **read-then-insert** เท่านั้น (อ่าน `existing`
-- ด้วย client ระดับ global แล้วค่อยเปิด `$transaction` ออกใบ) และ `wht_certificates` มี unique
-- แค่ที่ `certificate_number` ⇒ สองทางที่ทำให้รอบจ่ายเป็น `completed` ได้ (`17` §9/§18 — ยืนยันด้วยมือ
-- `completePayoutBatch()` กับการจับคู่กระทบยอดธนาคารของไฟล์ 35) ยิงพร้อมกันสำหรับรอบเดียวกัน
-- ⇒ ทั้งคู่เห็น `existing = null` ⇒ ได้ใบ `active` **สองใบต่อ 1 expense record**
-- ⇒ ยอด ภ.ง.ด.3/53 ของงวดนั้นเกินจริง และผู้รับเงินถือใบซ้ำสองเลข
-- (เรียกซ้ำแบบ *ตามลำดับ* ผ่านอยู่แล้ว — ที่พังคือกรณีพร้อมกัน · แนวเดียวกับ Phase 8.2
--  `20260816010000_bank_transaction_dedupe`)
--
-- ### ทางแก้
-- partial unique index บน `(organization_id, expense_record_id) WHERE status = 'active'` — สะท้อน
-- กติกาที่ชั้น app บังคับอยู่แล้วเป๊ะ ("มีใบ `active` อยู่แล้ว = ไม่ออกใหม่") จึงไม่เปลี่ยนความหมาย
-- ของระบบ · ใบที่ `cancelled` ไม่ถูกนับ ⇒ การยกเลิกแล้วออกใบแทน (`33` §10 — cancel ก่อน issue
-- ใน `$transaction` เดียว) ยังทำได้ตามปกติ และใบเก่ายังอยู่ครบ (`02` §13 ห้ามลบ)
--
-- Prisma เขียน partial index (`WHERE`) ใน `schema.prisma` ไม่ได้ ⇒ raw SQL ตาม Rule 02
-- (บันทึกไว้เป็นคอมเมนต์ใน `schema.prisma` ให้หาเจอ)
--
-- ⚠️ ถ้าฐานปลายทางมีใบ `active` ซ้ำค้างอยู่ก่อน migration นี้จะล้ม (ตั้งใจ) — ต้องยกเลิกใบส่วนเกิน
--    ด้วยมือผ่าน `cancelWhtCertificate()` ก่อน ห้ามให้ migration ลบใบเอง (เลขที่ห้ามขาดช่วง)

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wht_cert_active_per_expense
  ON wht_certificates (organization_id, expense_record_id)
  WHERE status = 'active';

COMMENT ON INDEX uniq_wht_cert_active_per_expense IS
  'Phase 8.3 — 1 expense record มีใบ 50 ทวิ ที่ active ได้ใบเดียว (`33` §9) · ใบ cancelled ไม่นับ';

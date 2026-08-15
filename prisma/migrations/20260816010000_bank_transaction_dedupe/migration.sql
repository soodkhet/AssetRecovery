-- Phase 8.2 — กันรายการเดินบัญชีซ้ำที่ระดับ DB (`35` §6.2 · Rule 09 idempotency)
--
-- ### ปัญหา
-- `importBankStatement()` กันซ้ำด้วย read-then-insert เท่านั้น (`statementRowKey()` = วัน|ยอด|รายละเอียด)
-- และตาราง `bank_transactions` **ไม่มี unique constraint ใด ๆ** ⇒ อัปโหลดไฟล์เดิมสองครั้ง
-- **พร้อมกัน** (ดับเบิลคลิก / รีทราย / สองคนอัปไฟล์เดียวกัน) ทั้งสองฝั่งอ่านชุด `existing` ก่อนที่
-- อีกฝั่งจะ insert ⇒ ผ่านด่านกันซ้ำทั้งคู่ ⇒ **เงินเข้าถูกนับซ้ำ** ⇒ ยอด AR/การจับคู่เพี้ยนทั้งรอบ
-- (นำเข้าซ้ำแบบ *ตามลำดับ* ผ่านอยู่แล้ว — ที่พังคือกรณีพร้อมกัน)
--
-- ### ทางแก้
-- unique index ที่สะท้อน `statementRowKey()` เป๊ะ — `description` ถูก normalize แบบเดียวกับในโค้ด
-- (`trim().toLowerCase()` ⇒ `lower(btrim(...))`) แล้วห่อ `md5()` เพื่อไม่ให้ยาวชนเพดาน btree
-- ของ Postgres (~2704 ไบต์ต่อแถว) เมื่อธนาคารส่งรายละเอียดยาว ๆ มา
--
-- ไม่ได้เปลี่ยนความหมายของระบบ: โค้ดถือว่า (บัญชี, วัน, ยอด, รายละเอียด) ซ้ำ = รายการเดียวกันอยู่แล้ว
-- แม้แต่ภายในไฟล์เดียวกัน (`seen.add(key)`) ⇒ index นี้ปฏิเสธเฉพาะสิ่งที่ชั้น app ปฏิเสธอยู่แล้ว
--
-- Prisma เขียน functional index ใน `schema.prisma` ไม่ได้ ⇒ อยู่ใน raw SQL migration ตาม Rule 02
--
-- ⚠️ ถ้าฐานปลายทางมีรายการซ้ำค้างอยู่ก่อน migration นี้จะล้ม (ตั้งใจ) — ต้องตรวจ/รวมรายการด้วยมือ
--    ก่อน ห้ามให้ migration ลบรายการเดินบัญชีเอง

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_tx_statement_row
  ON bank_transactions (organization_id, bank_account_id, transaction_date, amount_satang,
                        md5(lower(btrim(description))));

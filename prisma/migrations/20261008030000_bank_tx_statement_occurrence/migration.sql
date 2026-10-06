-- มติ PO 07/10/2569 U136 — คีย์กันนำเข้า statement ซ้ำต้องไม่กลืนรายการจริงที่หน้าตาเหมือนกัน
--
-- ### ปัญหา
-- คีย์เดิม (บัญชี, วัน, ยอด, รายละเอียด) ⇒ เงินเข้าจริง 2 รายการที่เหมือนกันทุกช่องในวันเดียว
-- (เช่น ลูกค้าโอน 2 ก้อนยอดเท่ากัน) ถูกนับเป็นรายการเดียว — ก้อนที่สองหายเงียบ
--
-- ### ทางแก้
-- `occurrence_seq` = ลำดับการเกิดของแถวที่มีคีย์เดิมเหมือนกัน **ภายในไฟล์เดียว** (1, 2, …)
-- เข้าไปในคีย์กันซ้ำด้วย:
--  · 2 รายการเหมือนกันในไฟล์เดียว ⇒ ลำดับ 1 และ 2 ⇒ เก็บได้ 2 แถว
--  · นำเข้าไฟล์เดิมซ้ำ (หรือไฟล์ที่ช่วงวันซ้อนกัน) ⇒ ได้ลำดับเดิม ⇒ ยังถูกกันว่าเป็นแถวเดิม
--  · ไม่ใช้เลขบรรทัด เพราะไฟล์ช่วงวันที่ต่างกันทำให้เลขบรรทัดเลื่อน ⇒ จะนำเข้าซ้ำได้
--  · ไม่ใช้ยอดคงเหลือ เพราะรูปแบบไฟล์ของบางธนาคารไม่มีคอลัมน์นี้ (คีย์ต้องเหมือนกันทุกรูปแบบ)
--
-- แถวเดิมทั้งหมดได้ลำดับ 1 (ค่า default) — ไม่ซ้ำกันอยู่แล้วภายใต้ index เดิม ⇒ สร้าง index ใหม่ได้เสมอ

ALTER TABLE "bank_transactions"
  ADD COLUMN "occurrence_seq" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "bank_transactions"
  ADD CONSTRAINT "chk_bank_tx_occurrence_seq_positive" CHECK ("occurrence_seq" >= 1);

DROP INDEX IF EXISTS uniq_bank_tx_statement_row;

CREATE UNIQUE INDEX uniq_bank_tx_statement_row
  ON bank_transactions (organization_id, bank_account_id, transaction_date, amount_satang,
                        md5(lower(btrim(description))), occurrence_seq);

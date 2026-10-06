-- มติ PO 07/10/2569 U144 (Final ด่าน 5 ND-1 · B4) — เพดานตัดส่วนต่างค่าธรรมเนียมมีผลจริง
-- รับชำระรอบวางบิลขาดไม่เกิน finance_policy_settings.write_off_tolerance_satang ⇒ ส่วนต่างตัดเป็น "ค่าธรรมเนียมธนาคาร"
-- นับเป็นชำระแล้ว (รอบปิด paid) · ยอด + วันที่เก็บบนรอบวางบิล (คำนวณใหม่จากยอดสะสมทุกครั้งที่รับเงิน — `22` §6.11.1)
-- ข้อมูลเดิม: ไม่มีการตัดย้อนหลัง (0 / NULL) — รอบเดิมที่ค้างจะถูกประเมินอีกครั้งเมื่อมีการจับคู่เงินรับครั้งถัดไป
ALTER TABLE "billing_batches"
  ADD COLUMN "bank_fee_written_off_satang" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bank_fee_written_off_date" DATE;

ALTER TABLE "billing_batches"
  ADD CONSTRAINT "chk_billing_batches_bank_fee_non_negative" CHECK ("bank_fee_written_off_satang" >= 0),
  ADD CONSTRAINT "chk_billing_batches_bank_fee_date_pair" CHECK (
    ("bank_fee_written_off_satang" = 0) = ("bank_fee_written_off_date" IS NULL)
  );

-- Export Pack เลือกตามวันที่ตัด (เฉพาะรอบที่มีการตัด)
CREATE INDEX "idx_billing_batches_bank_fee_date"
  ON "billing_batches"("organization_id", "bank_fee_written_off_date")
  WHERE "bank_fee_written_off_satang" > 0;

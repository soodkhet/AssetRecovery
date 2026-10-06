-- เงื่อนไขการหัก (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว เป็นค่าตั้ง (มติ PO 06/10/2569 U105 · `02` v4.44 · `22` §6.9.2 · `13` §6.4.2)
--
-- 1) ค่าตั้งใหม่ใน `wht_policy_history` (effective-dated insert-only) — ค่าเริ่มต้น **ปิด** (ใช้ได้เฉพาะ (1) หัก ณ ที่จ่าย)
-- 2) snapshot ค่าตั้งลง `payout_batches` (NULL = รอบเก่า ⇒ ไม่อนุญาต · คิดแบบ (1))
-- 3) snapshot เงื่อนไขของผู้รับลง `payout_batch_items` (NULL = รอบเก่า/เงินทดรองจ่าย ⇒ (1))
--    (2)/(3): gross = เงินได้ + ภาษีที่บริษัทออกให้ · net = เงินได้เต็ม · wht = ภาษีที่ออกให้ ⇒ `net = gross − wht` ยังจริง

ALTER TABLE "wht_policy_history"
  ADD COLUMN "allow_gross_up_conditions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payout_batches"
  ADD COLUMN "wht_allow_gross_up_conditions" BOOLEAN;

ALTER TABLE "payout_batch_items"
  ADD COLUMN "wht_condition" "wht_condition";

-- เงินทดรองจ่ายไม่ใช่เงินได้ ⇒ ไม่มีเงื่อนไขการหัก
ALTER TABLE "payout_batch_items"
  ADD CONSTRAINT "chk_payout_batch_items_wht_condition_expense_only"
  CHECK (wht_condition IS NULL OR advance_id IS NULL);

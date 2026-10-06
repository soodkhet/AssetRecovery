-- มติ PO U165 — เทมเพลตค่าบริการแยกยอด "กรณีสำเร็จ" / "กรณีไม่สำเร็จ"
-- แทนสวิตช์ charge_on_fail (BOOLEAN) ด้วย fail_fee_satang (INTEGER NULL · NULL = ไม่เก็บกรณีไม่สำเร็จ)
-- แปลงข้อมูลเดิมให้ผลรายได้เท่าเดิมทุกบาท:
--   FLAT/HYBRID + charge_on_fail = true  → fail_fee_satang = base_satang (เดิม closed_fail ได้ base)
--   charge_on_fail = false               → NULL (เดิมไม่เก็บ)
--   SUCCESS_FEE + true (ไม่ควรมี)        → NULL (เดิมสูตรไม่เก็บ SUCCESS_FEE เมื่อไม่สำเร็จเสมอ)

-- 1) เทมเพลต
ALTER TABLE "service_fee_templates" ADD COLUMN "fail_fee_satang" INTEGER;
UPDATE "service_fee_templates"
   SET "fail_fee_satang" = "base_satang"
 WHERE "charge_on_fail" = true AND "model" <> 'SUCCESS_FEE';
ALTER TABLE "service_fee_templates" DROP COLUMN "charge_on_fail";
ALTER TABLE "service_fee_templates"
  ADD CONSTRAINT "chk_service_fee_templates_fail_fee_non_negative"
  CHECK ("fail_fee_satang" IS NULL OR "fail_fee_satang" >= 0);

-- 2) snapshot บนเคส (ตอน approved)
ALTER TABLE "cases" ADD COLUMN "service_fee_fail_fee_satang" INTEGER;
UPDATE "cases"
   SET "service_fee_fail_fee_satang" = "service_fee_base_satang"
 WHERE "service_fee_charge_on_fail" = true
   AND "service_fee_model_snapshot" IS DISTINCT FROM 'SUCCESS_FEE';
ALTER TABLE "cases" DROP COLUMN "service_fee_charge_on_fail";
ALTER TABLE "cases"
  ADD CONSTRAINT "chk_cases_service_fee_fail_fee_non_negative"
  CHECK ("service_fee_fail_fee_satang" IS NULL OR "service_fee_fail_fee_satang" >= 0);

-- 3) snapshot รอบก่อนรีไซเกิล (มติ O72(2))
ALTER TABLE "recycle_requests" ADD COLUMN "prev_service_fee_fail_fee_satang" INTEGER;
UPDATE "recycle_requests"
   SET "prev_service_fee_fail_fee_satang" = "prev_service_fee_base_satang"
 WHERE "prev_service_fee_charge_on_fail" = true
   AND "prev_service_fee_model" IS DISTINCT FROM 'SUCCESS_FEE';
ALTER TABLE "recycle_requests" DROP COLUMN "prev_service_fee_charge_on_fail";
ALTER TABLE "recycle_requests"
  ADD CONSTRAINT "chk_recycle_requests_prev_fail_fee_non_negative"
  CHECK ("prev_service_fee_fail_fee_satang" IS NULL OR "prev_service_fee_fail_fee_satang" >= 0);

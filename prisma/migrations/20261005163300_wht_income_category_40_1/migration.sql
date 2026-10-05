-- ประเภทเงินได้ต่อประเภททีมเป็นค่าตั้ง + เงินได้ 40(1) — มติ PO 05/10/2569 (UAT U33)
-- โหมด by_team_side เลือกประเภทเงินได้ของ inhouse / outsource เองแยกกัน (40(1)/40(2)/40(8))
-- ค่าเริ่มต้นของการจับคู่ = พฤติกรรมเดิม (inhouse 40(2) · outsource 40(8)) ⇒ แถวค่าตั้งเดิมไม่เปลี่ยนความหมาย
-- snapshot ลงรอบจ่าย · รอบเก่า NULL = การจับคู่เดิม · 40(1) ใช้อัตราต่อคน wht_40_2_pct + ภ.ง.ด.1 เหมือน 40(2)

-- AlterEnum
ALTER TYPE "wht_income_category" ADD VALUE 'sec_40_1';

-- AlterTable — การจับคู่ต่อประเภททีมในชุดค่าตั้ง (effective-dated insert-only เดิม)
ALTER TABLE "wht_policy_history" ADD COLUMN "inhouse_income_category" "wht_income_category" NOT NULL DEFAULT 'sec_40_2',
ADD COLUMN "outsource_income_category" "wht_income_category" NOT NULL DEFAULT 'sec_40_8';

-- AlterTable — snapshot การจับคู่ของรอบจ่าย
ALTER TABLE "payout_batches" ADD COLUMN "wht_inhouse_income_category" "wht_income_category",
ADD COLUMN "wht_outsource_income_category" "wht_income_category";

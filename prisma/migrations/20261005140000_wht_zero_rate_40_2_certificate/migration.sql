-- ค่าตั้ง "เงินได้ 40(2) อัตรา 0%: ออก 50 ทวิ + รวมใน ภ.ง.ด.1" — มติ PO 05/10/2569 (UAT U16)
-- effective-dated ไปกับค่าตั้งภาษีชุดเดิม (wht_policy_history) + snapshot ลงรอบจ่าย
-- แถวค่าตั้งเดิมได้ค่าเริ่มต้น = ออก (ตามมติ) · รอบจ่ายเดิม snapshot = NULL ⇒ พฤติกรรมเดิม (ไม่ออก)

-- AlterTable
ALTER TABLE "wht_policy_history" ADD COLUMN "issue_zero_rate_40_2_certificate" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "payout_batches" ADD COLUMN "wht_issue_zero_rate_40_2_certificate" BOOLEAN;

-- ค่าตั้งภาษีหัก ณ ที่จ่าย — มติ PO 05/10/2569 (UAT U3/U4/U5/U7/U8)
-- ฐาน WHT เลือกชนิดรายการได้ · การออก 50 ทวิ ต่อผู้รับต่อรอบ/ต่อรายการ · ประเภทเงินได้ 40(8)/40(2)/แยกตามทีม
-- effective-dated (insert-only แบบ vat_rate_history) + snapshot ลงรอบจ่าย · ข้อมูลเดิมไม่เปลี่ยน
-- (คอลัมน์ snapshot ของรอบเก่าเป็น NULL = พฤติกรรมเดิม · ใบ 50 ทวิ เดิม issue_mode = per_item)

-- CreateEnum
CREATE TYPE "wht_certificate_mode" AS ENUM ('per_payee_batch', 'per_item');

-- CreateEnum
CREATE TYPE "wht_income_type_mode" AS ENUM ('all_40_8', 'all_40_2', 'by_team_side');

-- CreateEnum
CREATE TYPE "wht_income_category" AS ENUM ('sec_40_8', 'sec_40_2');

-- AlterEnum — ภ.ง.ด.1 สำหรับเงินได้ 40(2)
ALTER TYPE "wht_filing_form" ADD VALUE 'PND1';

-- CreateTable
CREATE TABLE "wht_policy_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "base_expense_types" "expense_type"[],
    "certificate_mode" "wht_certificate_mode" NOT NULL,
    "income_type_mode" "wht_income_type_mode" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "wht_policy_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_wht_policy_history_org_date" ON "wht_policy_history"("organization_id", "effective_from");

-- AddForeignKey
ALTER TABLE "wht_policy_history" ADD CONSTRAINT "wht_policy_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_policy_history" ADD CONSTRAINT "wht_policy_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- เหตุผลบังคับ (กระทบภาษี)
ALTER TABLE "wht_policy_history" ADD CONSTRAINT "wht_policy_history_reason_not_blank" CHECK (btrim("reason") <> '');

-- AlterTable — อัตราหัก 40(2) ต่อคน
ALTER TABLE "payee_profiles" ADD COLUMN "wht_40_2_pct" DECIMAL(5,2);
ALTER TABLE "payee_profiles" ADD CONSTRAINT "payee_profiles_wht_40_2_pct_range" CHECK ("wht_40_2_pct" IS NULL OR ("wht_40_2_pct" >= 0 AND "wht_40_2_pct" <= 100));

-- AlterTable — snapshot ต่อรายการ
ALTER TABLE "payout_batch_items" ADD COLUMN "wht_base_included" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "wht_income_category" "wht_income_category";

-- AlterTable — snapshot ค่าตั้งของรอบ
ALTER TABLE "payout_batches" ADD COLUMN "wht_base_expense_types" "expense_type"[],
ADD COLUMN "wht_certificate_mode" "wht_certificate_mode",
ADD COLUMN "wht_income_type_mode" "wht_income_type_mode",
ADD COLUMN "wht_policy_id" UUID;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_wht_policy_id_fkey" FOREIGN KEY ("wht_policy_id") REFERENCES "wht_policy_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable — รูปแบบการออกใบ
ALTER TABLE "wht_certificates" ADD COLUMN "issue_mode" "wht_certificate_mode" NOT NULL DEFAULT 'per_item',
ADD COLUMN "payout_batch_id" UUID;

-- AddForeignKey
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_certificates_payout_batch_id_fkey" FOREIGN KEY ("payout_batch_id") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ใบแบบต่อผู้รับต่อรอบต้องรู้ว่าเป็นของรอบไหน
ALTER TABLE "wht_certificates" ADD CONSTRAINT "wht_cert_batch_mode_has_batch" CHECK ("issue_mode" <> 'per_payee_batch' OR "payout_batch_id" IS NOT NULL);

-- AlterTable — ยอด ภ.ง.ด.1 ของรอบนำส่ง
ALTER TABLE "wht_filing_summaries" ADD COLUMN "pnd1_satang" INTEGER NOT NULL DEFAULT 0;

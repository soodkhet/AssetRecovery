-- Phase 2.2 — Case Submission (ไฟล์ 38 §6/§11) เติมฟิลด์ที่ `02` §6 Group C ยังไม่ครอบคลุม
--
-- ⚠️ บล็อก `ALTER COLUMN updated_at DROP DEFAULT` (ทุกตาราง) และ `advances.return_satang SET NOT NULL`
-- ที่ `prisma migrate dev` แถมมาถูกลบออกด้วยมือ — เป็นของที่ Prisma ไม่รู้จัก (default/generated column
-- ที่เติมด้วย migration มือ) ถ้าปล่อยไว้จะทำลาย default เดิมและล้มกลางคัน (ดู REUSE_INDEX กับดัก 2026-08-14)

-- CreateEnum
CREATE TYPE "debtor_nationality" AS ENUM ('TH', 'MM', 'LA', 'KH', 'OTHER');

-- CreateEnum
CREATE TYPE "asset_kind" AS ENUM ('smartphone', 'tablet');

-- AlterTable: cases — ฟิลด์ตาม `38` §6.1/§6.1.1/§6.2/§6.4/§6.5
ALTER TABLE "cases" ADD COLUMN     "asset_kind" "asset_kind",
ADD COLUMN     "case_ref_normalized" TEXT,
ADD COLUMN     "debtor_nationality" "debtor_nationality",
ADD COLUMN     "debtor_nationality_other" TEXT,
ADD COLUMN     "debtor_passport_no" TEXT,
ADD COLUMN     "id_card_addr_detail" TEXT,
ADD COLUMN     "id_card_addr_district" TEXT,
ADD COLUMN     "id_card_addr_postal_code" VARCHAR(5),
ADD COLUMN     "id_card_addr_province" TEXT,
ADD COLUMN     "id_card_addr_subdistrict" TEXT,
ADD COLUMN     "projected_revenue_satang" INTEGER,
ADD COLUMN     "projected_revenue_source" TEXT,
ADD COLUMN     "work_addr_detail" TEXT,
ADD COLUMN     "work_addr_district" TEXT,
ADD COLUMN     "work_addr_postal_code" VARCHAR(5),
ADD COLUMN     "work_addr_province" TEXT,
ADD COLUMN     "work_addr_subdistrict" TEXT,
-- `38` §11 — เคสจาก API ต้องสร้าง draft ได้แม้ข้อมูลไม่ครบ ⇒ ปลด NOT NULL ของ 2 คอลัมน์นี้
ALTER COLUMN "debtor_name" DROP NOT NULL,
ALTER COLUMN "asset_description" DROP NOT NULL;

-- backfill ค่า normalize ของแถวเดิม (uppercase + trim เท่านั้น — `38` §11) แล้วค่อยบังคับ NOT NULL
UPDATE "cases" SET "case_ref_normalized" = upper(btrim("case_ref")) WHERE "case_ref_normalized" IS NULL;
ALTER TABLE "cases" ALTER COLUMN "case_ref_normalized" SET NOT NULL;

-- `38` §11 2-layer enforcement ชั้นที่ 1 — ห้าม case_ref ซ้ำภายในบริษัทไฟแนนซ์เดียวกัน (safety net ของ race)
-- เคสที่ถูกลบแบบ soft delete ไม่นับ (ปล่อยให้สร้างเลขสัญญาเดิมใหม่ได้)
CREATE UNIQUE INDEX "uniq_cases_company_case_ref" ON "cases"("organization_id", "company_id", "case_ref_normalized") WHERE "deleted_at" IS NULL;

-- AlterTable: recycle_requests — `38` §6.4 recycle_history (previous_round → new_round)
ALTER TABLE "recycle_requests" ADD COLUMN     "new_round" INTEGER,
ADD COLUMN     "previous_round" INTEGER;

-- CreateTable: case_edit_history — `38` §6.4 append-only
CREATE TABLE "case_edit_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "note" TEXT,
    "changed_fields" TEXT[],
    "edited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_by" UUID NOT NULL,

    CONSTRAINT "case_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_case_edit_history_case" ON "case_edit_history"("case_id", "edited_at");

-- AddForeignKey
ALTER TABLE "case_edit_history" ADD CONSTRAINT "case_edit_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_edit_history" ADD CONSTRAINT "case_edit_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_edit_history" ADD CONSTRAINT "case_edit_history_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

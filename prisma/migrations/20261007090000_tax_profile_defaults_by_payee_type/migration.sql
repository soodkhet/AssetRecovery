-- Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ — มติ PO 06/10/2569 U121 (หนี้ค้าง #3)
-- 4 ช่อง: inhouse/outsource × บุคคลธรรมดา/นิติบุคคล (ว่างได้ทุกช่อง) · insert-only — แถวล่าสุดมีผลทันที
-- ลำดับ resolve: Tax Profile รายคน → ค่าเริ่มต้นตามประเภท → อัตราแผน (เตือน) → ไม่มีเลย = บล็อกการสร้างรอบจ่าย
-- รอบจ่าย snapshot ชุดที่ใช้ (payout_batches.tax_profile_default_id) + Tax Profile ที่ใช้จริงต่อรายการ
-- (payout_batch_items.tax_profile_id เดิม) ⇒ แก้ค่าตั้งภายหลังไม่กระทบรอบเดิม · ข้อมูลเดิมไม่เปลี่ยน

-- CreateTable
CREATE TABLE "tax_profile_default_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "inhouse_individual_tax_profile_id" UUID,
    "inhouse_corporate_tax_profile_id" UUID,
    "outsource_individual_tax_profile_id" UUID,
    "outsource_corporate_tax_profile_id" UUID,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "tax_profile_default_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_tax_profile_default_history_org_created" ON "tax_profile_default_history"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "tax_profile_default_history" ADD CONSTRAINT "tax_profile_default_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_profile_default_history" ADD CONSTRAINT "tax_profile_default_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_profile_default_history" ADD CONSTRAINT "tax_profile_default_history_inhouse_individual_tax_profile_fkey" FOREIGN KEY ("inhouse_individual_tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_profile_default_history" ADD CONSTRAINT "tax_profile_default_history_inhouse_corporate_tax_profile__fkey" FOREIGN KEY ("inhouse_corporate_tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_profile_default_history" ADD CONSTRAINT "tax_profile_default_history_outsource_individual_tax_profi_fkey" FOREIGN KEY ("outsource_individual_tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_profile_default_history" ADD CONSTRAINT "tax_profile_default_history_outsource_corporate_tax_profil_fkey" FOREIGN KEY ("outsource_corporate_tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- เหตุผลบังคับ (กระทบภาษี)
ALTER TABLE "tax_profile_default_history" ADD CONSTRAINT "tax_profile_default_history_reason_not_blank" CHECK (btrim("reason") <> '');

-- insert-only บังคับที่ชั้น service (ไม่มี PATCH/DELETE — แนวเดียวกับ wht_policy_history)

-- AlterTable — snapshot ชุดค่าเริ่มต้นที่มีผล ณ วันสร้างรอบ
ALTER TABLE "payout_batches" ADD COLUMN "tax_profile_default_id" UUID;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_tax_profile_default_id_fkey" FOREIGN KEY ("tax_profile_default_id") REFERENCES "tax_profile_default_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

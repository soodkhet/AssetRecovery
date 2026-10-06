-- มติ PO U133 (07/10/2569) — "ใช้กับ (ขอบเขต)" ของรอบบิล/รอบจ่ายเดิมเป็นข้อความอิสระที่ไม่มีผล
-- ⇒ เปลี่ยนเป็นขอบเขตจริง: รอบบิล (AR) = ทุกบริษัท หรือเลือกรายบริษัท (junction) · รอบจ่าย (AP) = ทุกทีม / In-house / Outsource
-- ข้อความเดิมเก็บไว้ที่ `legacy_scope_note` (อ้างอิงเท่านั้น) · แปลงไม่ได้ = ทุกบริษัท/ทุกทีม
-- + payout_batches.cycle_id / pay_due_date (ระบบเลือกรอบจ่ายที่ตรงฝั่งให้ตอนสร้างรอบจ่าย)

-- CreateEnum
CREATE TYPE "cycle_scope_kind" AS ENUM ('all_companies', 'selected_companies', 'all_teams', 'inhouse', 'outsource');

-- AlterTable — เติมคอลัมน์ใหม่ก่อน แปลงข้อมูล แล้วจึงบังคับ NOT NULL + ทิ้งคอลัมน์ข้อความเดิม
ALTER TABLE "billing_payout_cycles" ADD COLUMN "scope_kind" "cycle_scope_kind";
ALTER TABLE "billing_payout_cycles" ADD COLUMN "legacy_scope_note" TEXT;

UPDATE "billing_payout_cycles"
SET "legacy_scope_note" = NULLIF(btrim("scope"), ''),
    "scope_kind" = CASE
      WHEN "type" = 'AR' THEN 'all_companies'::"cycle_scope_kind"
      -- AP: ข้อความระบุฝั่งเดียวชัดเจน = ฝั่งนั้น · นอกนั้น (ทั้งสองฝั่ง/อ่านไม่ออก) = ทุกทีม
      WHEN "scope" ~* '(outsource|เอาท์ซอร์ส|เอ้าท์ซอร์ส)' AND "scope" !~* '(in-?house|อินเฮาส์|พนักงานประจำ)'
        THEN 'outsource'::"cycle_scope_kind"
      WHEN "scope" ~* '(in-?house|อินเฮาส์|พนักงานประจำ)' AND "scope" !~* '(outsource|เอาท์ซอร์ส|เอ้าท์ซอร์ส)'
        THEN 'inhouse'::"cycle_scope_kind"
      ELSE 'all_teams'::"cycle_scope_kind"
    END;

ALTER TABLE "billing_payout_cycles" ALTER COLUMN "scope_kind" SET NOT NULL;
ALTER TABLE "billing_payout_cycles" DROP COLUMN "scope";

-- ขอบเขตต้องเข้าคู่กับชนิดรอบ
ALTER TABLE "billing_payout_cycles" ADD CONSTRAINT "cycles_scope_matches_type" CHECK (
  ("type" = 'AR' AND "scope_kind" IN ('all_companies', 'selected_companies'))
  OR ("type" = 'AP' AND "scope_kind" IN ('all_teams', 'inhouse', 'outsource'))
);

-- CreateTable
CREATE TABLE "billing_cycle_companies" (
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_cycle_companies_pkey" PRIMARY KEY ("cycle_id","company_id")
);

-- CreateIndex
CREATE INDEX "idx_billing_cycle_companies_org_company" ON "billing_cycle_companies"("organization_id", "company_id");

-- AddForeignKey
ALTER TABLE "billing_cycle_companies" ADD CONSTRAINT "billing_cycle_companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_cycle_companies" ADD CONSTRAINT "billing_cycle_companies_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "billing_payout_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_cycle_companies" ADD CONSTRAINT "billing_cycle_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable — รอบจ่าย
ALTER TABLE "payout_batches" ADD COLUMN "cycle_id" UUID;
ALTER TABLE "payout_batches" ADD COLUMN "pay_due_date" DATE;
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "billing_payout_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- ใช้รอบ ⇔ มีกำหนดจ่าย
ALTER TABLE "payout_batches" ADD CONSTRAINT "chk_payout_batches_cycle_due" CHECK (("cycle_id" IS NULL) = ("pay_due_date" IS NULL));

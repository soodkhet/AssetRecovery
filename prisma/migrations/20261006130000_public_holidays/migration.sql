-- มติ PO 06/10/2569 (UAT U93) — ปฏิทินวันหยุดขององค์กร (`02` v4.35 · `13` §6.15)
-- ใช้เลื่อนกำหนดยื่นภาษี (ภ.ง.ด.) ที่ตรงวันหยุด/เสาร์-อาทิตย์ เป็นวันทำการถัดไป (`33` §6.2)

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_public_holidays_org_date" ON "public_holidays"("organization_id", "holiday_date");

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- raw SQL (Prisma ไม่รองรับ partial index / CHECK)
-- วันเดียวกันมีได้แถวเดียวที่ยังไม่ถูกลบ (ลบแล้วเพิ่มวันเดิมใหม่ได้) — ตัวบังคับจริงของ DUPLICATE_HOLIDAY_DATE
CREATE UNIQUE INDEX "uniq_public_holidays_active_date" ON "public_holidays"("organization_id", "holiday_date") WHERE "deleted_at" IS NULL;
ALTER TABLE "public_holidays" ADD CONSTRAINT "chk_public_holidays_name" CHECK (btrim("name") <> '');

-- backfill: สรุปรอบนำส่งที่ยังไม่ยื่นและกำหนดยื่นตรงเสาร์/อาทิตย์ ⇒ เลื่อนเป็นวันจันทร์ (กติกาใหม่ U93)
-- ตอนนี้ปฏิทินวันหยุดยังว่าง ⇒ ผลเท่ากับที่แอปคิดด้วย filingDueDateOf() ทุกแถว · รอบที่ยื่นแล้วไม่แตะ (ข้อมูลประวัติ)
UPDATE "wht_filing_summaries"
SET "filing_due_date" = "filing_due_date" + CASE EXTRACT(DOW FROM "filing_due_date")::int WHEN 6 THEN 2 ELSE 1 END
WHERE "status" = 'pending' AND EXTRACT(DOW FROM "filing_due_date")::int IN (0, 6);

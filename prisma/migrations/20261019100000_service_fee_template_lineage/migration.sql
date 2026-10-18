-- mytester7 S7-AG2-05 — เทมเพลตค่าบริการ: แยก "สายเวอร์ชัน" ออกจากชื่อ
-- เดิมจับกลุ่มเวอร์ชันด้วย `name` ⇒ เปลี่ยนชื่อในเวอร์ชันใหม่ต้องเขียนทับชื่อทุกเวอร์ชันเดิม
-- (เคสที่ snapshot v1 แสดงชื่อใหม่ที่ไม่ตรงยอด v1) · `lineage_id` = id ของเวอร์ชันแรก, NULL = แถวนี้คือเวอร์ชันแรกเอง
-- (nullable เพื่อให้การสร้างเวอร์ชันแรก/seed/test ที่ INSERT ตรงไม่ต้องรู้ id ล่วงหน้า)

ALTER TABLE "service_fee_templates" ADD COLUMN "lineage_id" UUID;

-- backfill: เวอร์ชันที่ไม่ใช่ตัวแรกของแต่ละ (organization_id, name) ชี้ไปตัวแรก (version ต่ำสุด)
UPDATE "service_fee_templates" AS t
SET "lineage_id" = first_version."id"
FROM (
  SELECT DISTINCT ON ("organization_id", "name") "organization_id", "name", "id"
  FROM "service_fee_templates"
  ORDER BY "organization_id", "name", "version" ASC
) AS first_version
WHERE t."organization_id" = first_version."organization_id"
  AND t."name" = first_version."name"
  AND t."id" <> first_version."id";

-- กันสร้างเวอร์ชันเลขซ้ำในสายเดียวกันภายใต้ concurrency (รวมกรณีเปลี่ยนชื่อพร้อมกัน)
CREATE UNIQUE INDEX "uniq_service_fee_templates_org_lineage_version"
  ON "service_fee_templates"("organization_id", "lineage_id", "version");

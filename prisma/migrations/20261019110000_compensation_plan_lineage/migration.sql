-- mytester7 FX2 — แผนค่าตอบแทน: แยก "สายเวอร์ชัน" ออกจากชื่อ (แบบเดียวกับ service_fee_templates S7-AG2-05)
-- เดิมจับกลุ่มเวอร์ชันด้วย `name` ⇒ เปลี่ยนชื่อในเวอร์ชันใหม่ต้องเขียนทับชื่อทุกเวอร์ชันเดิม
-- (รายการเบิกที่ snapshot comp_plan_id + version เดิมแสดงชื่อใหม่ที่ไม่ตรงยอดของเวอร์ชันนั้น)
-- `lineage_id` = id ของเวอร์ชันแรก, NULL = แถวนี้คือเวอร์ชันแรกเอง
-- (nullable เพื่อให้การสร้างเวอร์ชันแรก/seed/test ที่ INSERT ตรงไม่ต้องรู้ id ล่วงหน้า)

ALTER TABLE "compensation_plans" ADD COLUMN "lineage_id" UUID;

-- backfill: เวอร์ชันที่ไม่ใช่ตัวแรกของแต่ละ (organization_id, name) ชี้ไปตัวแรก (version ต่ำสุด)
-- ข้อมูลเดิมชื่อตรงกันทั้งสายเสมอ (โค้ดเดิมทับชื่อทุกเวอร์ชันตอนเปลี่ยนชื่อ) จึงจับกลุ่มด้วยชื่อได้ถูกต้อง
UPDATE "compensation_plans" AS t
SET "lineage_id" = first_version."id"
FROM (
  SELECT DISTINCT ON ("organization_id", "name") "organization_id", "name", "id"
  FROM "compensation_plans"
  ORDER BY "organization_id", "name", "version" ASC
) AS first_version
WHERE t."organization_id" = first_version."organization_id"
  AND t."name" = first_version."name"
  AND t."id" <> first_version."id";

-- กันสร้างเวอร์ชันเลขซ้ำในสายเดียวกันภายใต้ concurrency (รวมกรณีเปลี่ยนชื่อพร้อมกัน)
CREATE UNIQUE INDEX "uniq_compensation_plans_org_lineage_version"
  ON "compensation_plans"("organization_id", "lineage_id", "version");

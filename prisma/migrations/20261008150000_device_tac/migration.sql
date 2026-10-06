-- มติ PO U166 (07/10/2569) · DEC-017 แทน DEC-016 — แหล่งยี่ห้อ/รุ่นเปลี่ยนจาก RapidAPI เป็นฐาน TAC จาก IMEI
-- ① เลิก RapidAPI: ลบแถวแคตตาล็อกที่มาจาก API (source = 'api') — เคสที่อ้างอยู่คงข้อความ snapshot
--    (`cases.asset_description`) และตั้ง `device_model_id` เป็น NULL · แบรนด์ API ที่มีรุ่นเพิ่มเองอยู่ใต้ = แปลงเป็นเพิ่มเอง
-- ② enum `device_catalog_source` = ('tacdb', 'manual') · ตัดคอลัมน์ที่ใช้เฉพาะการดึง RapidAPI ของแบรนด์
-- ③ ตาราง `device_tacs` (TAC 8 หลัก → ยี่ห้อ/รุ่น/รหัสรุ่นย่อย/ปีที่ออก · source tacdb/learned/manual · ผูกรุ่นในแคตตาล็อก)
-- ④ ค่าตั้ง: สถานะการอัปเดตไฟล์ TAC (ETag) + รายการตัวเลือกความจุ/สี
-- ⑤ เคส/ทรัพย์: ความจุ + สี (snapshot ข้อความ) · คลังติ๊ก "สี/ความจุตรง"
-- ⑥ งาน `device_catalog_sync` ที่ค้างในคิว = ยกเลิก (job_type ถูกแทนด้วย `device_tac_sync`)

-- ① ลบแถวจาก RapidAPI
UPDATE "cases" SET "device_model_id" = NULL
WHERE "device_model_id" IN (SELECT "id" FROM "device_models" WHERE "source" = 'api');
DELETE FROM "device_models" WHERE "source" = 'api';
UPDATE "device_brands" b SET "source" = 'manual', "external_id" = NULL
WHERE b."source" = 'api' AND EXISTS (SELECT 1 FROM "device_models" m WHERE m."brand_id" = b."id");
DELETE FROM "device_brands" b
WHERE b."source" = 'api' AND NOT EXISTS (SELECT 1 FROM "device_models" m WHERE m."brand_id" = b."id");

-- ② enum ใหม่ (ไม่มีแถว 'api' เหลือแล้ว)
ALTER TYPE "device_catalog_source" RENAME TO "device_catalog_source_old";
CREATE TYPE "device_catalog_source" AS ENUM ('tacdb', 'manual');
ALTER TABLE "device_brands" ALTER COLUMN "source" TYPE "device_catalog_source" USING ("source"::text::"device_catalog_source");
ALTER TABLE "device_models" ALTER COLUMN "source" TYPE "device_catalog_source" USING ("source"::text::"device_catalog_source");
DROP TYPE "device_catalog_source_old";

DROP INDEX IF EXISTS "idx_device_brands_org_last_synced";
ALTER TABLE "device_brands" DROP COLUMN "last_synced_at";
ALTER TABLE "device_brands" DROP COLUMN "external_id";

-- ③ ตาราง TAC
CREATE TYPE "device_tac_source" AS ENUM ('tacdb', 'learned', 'manual');

CREATE TABLE "device_tacs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "tac" CHAR(8) NOT NULL,
    "brand_name" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "variant" TEXT,
    "release_year" INTEGER,
    "source" "device_tac_source" NOT NULL,
    "device_model_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "device_tacs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_device_tacs_tac_digits" CHECK ("tac" ~ '^[0-9]{8}$'),
    CONSTRAINT "chk_device_tacs_names_not_blank" CHECK (btrim("brand_name") <> '' AND btrim("model_name") <> ''),
    CONSTRAINT "chk_device_tacs_release_year" CHECK ("release_year" IS NULL OR "release_year" BETWEEN 1980 AND 2100)
);

CREATE UNIQUE INDEX "uniq_device_tacs_org_tac" ON "device_tacs"("organization_id", "tac");
CREATE INDEX "idx_device_tacs_org_model" ON "device_tacs"("organization_id", "device_model_id");
CREATE INDEX "idx_device_tacs_org_source" ON "device_tacs"("organization_id", "source");

ALTER TABLE "device_tacs" ADD CONSTRAINT "device_tacs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_tacs" ADD CONSTRAINT "device_tacs_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "device_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "device_tacs" ADD CONSTRAINT "device_tacs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ④ ค่าตั้ง
ALTER TABLE "device_catalog_settings"
  ADD COLUMN "tac_etag" TEXT,
  ADD COLUMN "tac_checked_at" TIMESTAMPTZ(6),
  ADD COLUMN "tac_imported_at" TIMESTAMPTZ(6),
  ADD COLUMN "capacity_options" TEXT[] NOT NULL DEFAULT ARRAY['16GB','32GB','64GB','128GB','256GB','512GB','1TB','2TB']::TEXT[],
  ADD COLUMN "color_options" TEXT[] NOT NULL DEFAULT ARRAY['ดำ','ขาว','เงิน','เทา','ทอง','น้ำเงิน','ฟ้า','เขียว','ม่วง','ชมพู','แดง','ส้ม','เหลือง']::TEXT[];

-- ⑤ ความจุ/สี
ALTER TABLE "cases" ADD COLUMN "asset_capacity" TEXT, ADD COLUMN "asset_color" TEXT;
ALTER TABLE "assets"
  ADD COLUMN "device_capacity" TEXT,
  ADD COLUMN "device_color" TEXT,
  ADD COLUMN "color_capacity_matched" BOOLEAN;

-- ⑥ งานเก่าในคิว
UPDATE "jobs" SET "status" = 'cancelled', "error_message" = 'เลิกใช้แหล่งข้อมูลเดิม — แทนด้วยงานอัปเดตฐาน TAC รายวัน'
WHERE "job_type" = 'device_catalog_sync' AND "status" IN ('pending', 'running');

-- มติ PO U155 → U159 (07/10/2569) · DEC-016 — แคตตาล็อก "Model Phone" (แบรนด์/รุ่นเครื่อง)
-- job `device_catalog_sync` ดึงทุกแบรนด์/ทุกรุ่นจาก RapidAPI เก็บไว้ทั้งหมด
-- การแสดงในตัวเลือก = manual_status (ผู้ดูแลตั้ง — ชนะเสมอ) ไม่งั้นตามตัวกรองในค่าตั้ง
-- (แบรนด์ในรายชื่อ + รุ่นที่ออกภายใน N ปี) — คำนวณตอนอ่าน · job/การเปลี่ยนตัวกรองไม่เขียน manual_status
-- เคสเก็บข้อความแบรนด์/รุ่นเป็น snapshot ที่ `asset_description` เหมือนเดิม + อ้าง `device_model_id` เมื่อเลือกจากรายการ

-- CreateEnum
CREATE TYPE "device_catalog_status" AS ENUM ('active', 'hidden');

-- CreateEnum
CREATE TYPE "device_catalog_source" AS ENUM ('api', 'manual');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN "device_model_id" UUID;

-- CreateTable
CREATE TABLE "device_catalog_settings" (
    "organization_id" UUID NOT NULL,
    "brand_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "recent_years" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_by" UUID,

    CONSTRAINT "device_catalog_settings_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "chk_device_catalog_recent_years" CHECK ("recent_years" BETWEEN 1 AND 30)
);

-- CreateTable
CREATE TABLE "device_brands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "manual_status" "device_catalog_status",
    "source" "device_catalog_source" NOT NULL,
    "external_id" TEXT,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "device_brands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_device_brands_name_not_blank" CHECK (btrim("name") <> '' AND "name_key" <> '')
);

-- CreateTable
CREATE TABLE "device_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "asset_kind" "asset_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "manual_status" "device_catalog_status",
    "source" "device_catalog_source" NOT NULL,
    "external_id" TEXT,
    "release_year" INTEGER,
    "name_edited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "device_models_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_device_models_name_not_blank" CHECK (btrim("name") <> '' AND "name_key" <> ''),
    CONSTRAINT "chk_device_models_release_year" CHECK ("release_year" IS NULL OR "release_year" BETWEEN 1990 AND 2100)
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_device_brands_org_name" ON "device_brands"("organization_id", "name_key");

-- CreateIndex
CREATE INDEX "idx_device_brands_org_last_synced" ON "device_brands"("organization_id", "last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_device_models_brand_name" ON "device_models"("brand_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_device_models_brand_external" ON "device_models"("brand_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_device_models_org_kind" ON "device_models"("organization_id", "asset_kind");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "device_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_catalog_settings" ADD CONSTRAINT "device_catalog_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_catalog_settings" ADD CONSTRAINT "device_catalog_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_brands" ADD CONSTRAINT "device_brands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_brands" ADD CONSTRAINT "device_brands_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "device_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

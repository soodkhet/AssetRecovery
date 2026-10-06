-- มติ PO U167 (07/10/2569) — ประวัติการอัปเดตฐาน TAC ในหน้า Model Phone
-- insert-only 1 แถวต่อรอบต่อองค์กร (ผล/ผู้สั่ง/จำนวนที่เพิ่ม/รายชื่อรุ่นที่เพิ่ม/commit + วันที่ไฟล์บน GitHub ถูกแก้ล่าสุด)
-- + ค่าตั้ง: commit/วันที่ไฟล์ต้นทางของการนำเข้าสำเร็จล่าสุด + จำนวนวันที่ถือว่าแหล่งข้อมูลอาจหยุดอัปเดต (เริ่ม 90)

ALTER TABLE "device_catalog_settings"
  ADD COLUMN "tac_source_sha" TEXT,
  ADD COLUMN "tac_source_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN "stale_alert_days" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "device_catalog_settings" ADD CONSTRAINT "chk_device_catalog_stale_alert_days" CHECK ("stale_alert_days" BETWEEN 1 AND 3650);

CREATE TYPE "device_tac_update_trigger" AS ENUM ('daily', 'manual', 'file');
CREATE TYPE "device_tac_update_status" AS ENUM ('success', 'not_modified', 'failed');

CREATE TABLE "device_tac_updates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "job_id" UUID,
    "trigger" "device_tac_update_trigger" NOT NULL,
    "status" "device_tac_update_status" NOT NULL,
    "source_sha" TEXT,
    "etag" TEXT,
    "source_updated_at" TIMESTAMPTZ(6),
    "file_rows" INTEGER NOT NULL DEFAULT 0,
    "tacs_added" INTEGER NOT NULL DEFAULT 0,
    "brands_added" INTEGER NOT NULL DEFAULT 0,
    "models_added" INTEGER NOT NULL DEFAULT 0,
    "added_models" JSONB NOT NULL DEFAULT '[]',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "device_tac_updates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_device_tac_updates_counts" CHECK ("file_rows" >= 0 AND "tacs_added" >= 0 AND "brands_added" >= 0 AND "models_added" >= 0)
);

CREATE INDEX "idx_device_tac_updates_org_created" ON "device_tac_updates"("organization_id", "created_at" DESC);

ALTER TABLE "device_tac_updates" ADD CONSTRAINT "device_tac_updates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_tac_updates" ADD CONSTRAINT "device_tac_updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

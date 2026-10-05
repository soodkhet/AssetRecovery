-- มติ PO 06/10/2569 (U97 — PDPA) — ระยะเก็บเอกสารลูกหนี้ (`02` v4.37 · `13` §6.16 · `90` §6.2 · `91` §6.1)
-- ค่าตั้งจำนวนปีหลังปิดเคส (ค่าเริ่มต้น 5 · 1–20) → job `purge_debtor_documents` ลบไฟล์เอกสารลูกหนี้บน Storage เมื่อครบ
-- เก็บ metadata ว่าถูกลบเมื่อไร — ไม่ลบแถวเคส/ข้อมูลที่ไม่ใช่ไฟล์

-- 1) ค่าตั้งระดับองค์กร (1 record/org — ยังไม่มีแถว = ค่าเริ่มต้น 5 ปี)
CREATE TABLE "data_retention_settings" (
    "organization_id" UUID NOT NULL,
    "debtor_document_retention_years" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "data_retention_settings_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "chk_data_retention_years_range" CHECK ("debtor_document_retention_years" BETWEEN 1 AND 20)
);

ALTER TABLE "data_retention_settings"
  ADD CONSTRAINT "data_retention_settings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_retention_settings"
  ADD CONSTRAINT "data_retention_settings_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) metadata การลบไฟล์ — ระดับเคส (แสดงบนหน้าเคส) และระดับไฟล์ (แถวคงไว้เป็นหลักฐาน path/hash/ชื่อไฟล์)
ALTER TABLE "cases" ADD COLUMN "debtor_documents_purged_at" TIMESTAMPTZ(6);
ALTER TABLE "case_documents" ADD COLUMN "purged_at" TIMESTAMPTZ(6);

-- ไฟล์ที่ถูกลบตามนโยบายต้องไม่ถูกแสดงเป็นไฟล์ใช้งาน ⇒ purged ต้องมี deleted_at เสมอ
ALTER TABLE "case_documents"
  ADD CONSTRAINT "chk_case_documents_purged_deleted"
  CHECK ("purged_at" IS NULL OR "deleted_at" IS NOT NULL);

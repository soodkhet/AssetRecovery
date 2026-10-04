-- มติ PO 05/10/2569 (UAT U9 · `02` v4.16): แคชรายงานย้ายจากหน่วยความจำของ process มาไว้ใน Postgres
-- ล้างครั้งเดียว (เช่นหลังอนุมัติ Adjustment — BUG-128) มีผลกับทุก instance ทันที
-- ตารางชั่วคราว: ไม่มี created_by/updated_by/deleted_at (ค่าคำนวณใหม่ได้เสมอ · ลบจริงเมื่อหมดอายุ/ถูกล้าง)
CREATE TABLE "report_cache_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload" JSONB,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_cache_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_report_cache_entries_org_key" ON "report_cache_entries"("organization_id", "cache_key");

CREATE INDEX "idx_report_cache_entries_organization_id_expires_at" ON "report_cache_entries"("organization_id", "expires_at");

ALTER TABLE "report_cache_entries" ADD CONSTRAINT "report_cache_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

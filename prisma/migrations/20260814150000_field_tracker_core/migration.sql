-- Phase 2.8 — Field Tracker core (`41` §6.1 / §6.4 / §6.4.1 / §6.5)
-- sync เข้า `02` §3 + §6 (v4.2) — เขียนด้วยมือทั้งใบ (`migrate dev` แถม SQL พยศ ดู REUSE_INDEX กับดัก 14/08/2569)

-- ── 1) assignment_status → 7 ค่าตาม `41` §10 ────────────────────────────────
-- ของเดิม 6 ค่า (pending/accepted/active/completed/reassigned/cancelled) แทน flow ภาคสนามไม่ได้:
-- แยก "จัดวันแล้ว/ยังไม่จัดวัน" ไม่ได้, แยก closed_success/closed_fail ไม่ได้ และไม่มี needs_revision
-- Postgres ลบค่าออกจาก enum ไม่ได้ → สร้างชนิดใหม่แล้วย้ายคอลัมน์
ALTER TYPE "assignment_status" RENAME TO "assignment_status_old";

CREATE TYPE "assignment_status" AS ENUM (
  'pending_accept',
  'accepted_unscheduled',
  'scheduled',
  'closed_success',
  'closed_fail',
  'needs_revision',
  'reassigned_away'
);

ALTER TABLE "case_assignments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "case_assignments"
  ALTER COLUMN "status" TYPE "assignment_status"
  USING (
    CASE "status"::text
      WHEN 'pending'    THEN 'pending_accept'
      WHEN 'accepted'   THEN 'accepted_unscheduled'
      WHEN 'active'     THEN 'scheduled'
      -- 'completed' เดิมไม่ได้แยกผลการติดตาม — ยังไม่มีโมดูลไหนเขียนค่านี้ (ไฟล์ 41 เพิ่งเกิดใน Phase นี้)
      WHEN 'completed'  THEN 'closed_success'
      WHEN 'reassigned' THEN 'reassigned_away'
      WHEN 'cancelled'  THEN 'reassigned_away'
    END
  )::"assignment_status";
ALTER TABLE "case_assignments" ALTER COLUMN "status" SET DEFAULT 'pending_accept';

DROP TYPE "assignment_status_old";

-- ── 2) travel_origin_source (`41` §6.4.1) ───────────────────────────────────
CREATE TYPE "travel_origin_source" AS ENUM ('gps_auto', 'manual_adjusted');

-- ── 3) ลำดับงานในวัน (`41` §6.1 schedule_order) ─────────────────────────────
ALTER TABLE "case_assignments" ADD COLUMN "schedule_order" INTEGER;
CREATE INDEX "idx_assignments_agent_schedule"
  ON "case_assignments"("agent_id", "scheduled_date", "schedule_order");

-- ── 4) หลักฐานปิดงานเก็บแยกตามประเภท (`41` §6.4) ────────────────────────────
-- `video_url` เดี่ยวแทน "วิดีโอหลายไฟล์" ของ §6.4 ไม่ได้ → เปลี่ยนเป็น array (ยังไม่มีข้อมูลจริงในตารางนี้)
ALTER TABLE "case_evidences" DROP COLUMN "video_url";
ALTER TABLE "case_evidences" ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "case_evidences" ADD COLUMN "videos" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "case_evidences" ADD COLUMN "audio_url" TEXT;

-- ── 5) travel_origins (`41` §6.4.1) — คนละชุดกับ check_ins เด็ดขาด ──────────
CREATE TABLE "travel_origins" (
  "id"              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID                 NOT NULL REFERENCES "organizations"("id"),
  "case_id"         UUID                 NOT NULL REFERENCES "cases"("id"),
  "assignment_id"   UUID                 NOT NULL REFERENCES "case_assignments"("id"),
  "latitude"        NUMERIC(10,7)        NOT NULL,
  "longitude"       NUMERIC(10,7)        NOT NULL,
  "source"          travel_origin_source NOT NULL DEFAULT 'gps_auto',
  "set_at"          TIMESTAMPTZ          NOT NULL,
  "created_at"      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  "created_by"      UUID                 NOT NULL REFERENCES "users"("id"),
  "updated_at"      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  "updated_by"      UUID                 REFERENCES "users"("id")
);
-- 1 เคส 1 จุดเริ่มเดินทาง (บังคับที่รอบติดตาม = assignment · รอบใหม่เริ่มจุดใหม่เสมอ)
CREATE UNIQUE INDEX "travel_origins_assignment_id_key" ON "travel_origins"("assignment_id");
CREATE INDEX "idx_travel_origins_case" ON "travel_origins"("case_id");

-- ── 6) close_case_drafts (`41` §6.5) — 1:1 ต่อเคส · ไม่มี expiry ────────────
CREATE TABLE "close_case_drafts" (
  "id"              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL REFERENCES "organizations"("id"),
  "case_id"         UUID         NOT NULL REFERENCES "cases"("id"),
  "assignment_id"   UUID         NOT NULL REFERENCES "case_assignments"("id"),
  "agent_id"        UUID         NOT NULL REFERENCES "users"("id"),
  "outcome"         case_outcome,
  "photos"          TEXT[]       NOT NULL DEFAULT '{}',
  "videos"          TEXT[]       NOT NULL DEFAULT '{}',
  "product_photos"  TEXT[]       NOT NULL DEFAULT '{}',
  "audio_url"       TEXT,
  "note"            TEXT,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "created_by"      UUID         NOT NULL REFERENCES "users"("id"),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_by"      UUID         REFERENCES "users"("id")
);
CREATE UNIQUE INDEX "close_case_drafts_assignment_id_key" ON "close_case_drafts"("assignment_id");
CREATE INDEX "idx_close_case_drafts_case" ON "close_case_drafts"("case_id");

-- รีวิว Phase 5 — คีย์กันซ้ำของงานเบื้องหลังต้องแยกตามองค์กร (`91` §11/§14 · Rule 02 multi-tenant)
--
-- ของเดิม (20260815180000) บังคับความไม่ซ้ำของ `payload->>'idempotencyKey'` **ทั้งระบบ**
-- แต่ `POST /api/jobs` รับคีย์จากผู้เรียกตรง ๆ ⇒ องค์กร B ที่บังเอิญใช้คีย์เดียวกับองค์กร A
-- จะได้ job **ขององค์กร A** กลับไปเป็น `duplicate: true` (งานของ B ไม่ถูกสร้าง + รั่วข้อมูลข้ามองค์กร)
--
-- COALESCE เพราะงานระดับระบบมี `organization_id IS NULL` และ unique index ของ Postgres
-- ถือว่า NULL ต่างกันเสมอ ⇒ ถ้าไม่แทนค่า งาน cron จะกันซ้ำไม่ได้เลย

DROP INDEX IF EXISTS uniq_jobs_idempotency_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_org_idempotency_key
  ON jobs (COALESCE(organization_id::text, 'system'), (payload->>'idempotencyKey'))
  WHERE (payload->>'idempotencyKey') IS NOT NULL;

COMMENT ON INDEX uniq_jobs_org_idempotency_key IS
  'กัน job ซ้ำจากคีย์ idempotency เดียวกัน **ภายในองค์กรเดียวกัน** (`91` §11 JOB_DUPLICATE → คืน job เดิม) — คีย์อยู่ใน payload เพราะ `02` §10 ไม่มีคอลัมน์ · organization_id NULL = งานระดับระบบ';

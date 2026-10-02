-- มติ PO 03/10/2569 — login ด้วยอีเมลหรือ username + ผู้ดูแลตั้ง/รีเซ็ตรหัสผ่านให้ผู้ใช้ได้ (แทน flow เชิญทางอีเมล D1)
--
-- 1. `users.username` — บังคับที่ชั้นแอป (Zod + service) · ที่ DB เป็น nullable เพื่อไม่ทำลาย insert เดิม
--    แต่มี CHECK ว่าต้องมี username หรือ email อย่างน้อย 1 (ไม่งั้นไม่มีทาง login)
-- 2. `users.email` ไม่บังคับอีกต่อไป (เจ้าหน้าที่ภาคสนามที่ไม่มีอีเมล) — บัญชี Supabase Auth ของคนไม่มีอีเมล
--    ใช้อีเมลภายในที่ระบบสร้างเอง (`lib/auth/login-identifier.ts`)
-- 3. `users.must_change_password` — ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ → บังคับเปลี่ยนเองตอน login ครั้งถัดไป
--
-- Backfill username ของแถวเดิม = ส่วนหน้า @ ของอีเมล (ตัวพิมพ์เล็ก, ตัดอักขระนอก [a-z0-9._-])
-- ชนกันในองค์กรเดียวกัน → ต่อท้าย `_2`, `_3` ตามลำดับ created_at · ผู้ดูแลแก้เป็นชื่อที่ต้องการได้ภายหลัง

ALTER TABLE "users" ADD COLUMN "username" VARCHAR(50);
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

WITH base AS (
  SELECT
    id,
    organization_id,
    created_at,
    left(
      regexp_replace(
        regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g'),
        '^[^a-z0-9]+', ''
      ),
      40
    ) AS raw_name
  FROM "users"
  WHERE "username" IS NULL
),
named AS (
  SELECT
    id,
    organization_id,
    created_at,
    CASE
      WHEN raw_name = '' THEN 'user'
      WHEN length(raw_name) < 3 THEN raw_name || '_u'
      ELSE raw_name
    END AS base_name
  FROM base
),
ranked AS (
  SELECT
    id,
    base_name,
    row_number() OVER (PARTITION BY organization_id, base_name ORDER BY created_at, id) AS rn
  FROM named
)
UPDATE "users" u
SET "username" = CASE WHEN r.rn = 1 THEN r.base_name ELSE r.base_name || '_' || r.rn END
FROM ranked r
WHERE u.id = r.id;

ALTER TABLE "users"
  ADD CONSTRAINT "users_login_identifier_check" CHECK ("username" IS NOT NULL OR "email" IS NOT NULL);

-- Prisma เขียน partial unique index ไม่ได้ ⇒ raw SQL (Rule 02) · ผู้ใช้ที่ลบแล้วคืนชื่อให้ใช้ซ้ำได้
CREATE UNIQUE INDEX "idx_users_organization_id_username_active"
  ON "users" ("organization_id", "username")
  WHERE "deleted_at" IS NULL AND "username" IS NOT NULL;

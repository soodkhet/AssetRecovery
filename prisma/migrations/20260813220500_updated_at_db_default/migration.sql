-- updated_at DEFAULT NOW() (`02` §2.4)
--
-- Prisma `@updatedAt` เซ็ตค่าให้ที่ app layer เท่านั้น **ไม่ออก DB default** ⇒ ทุก INSERT ที่ไม่ผ่าน
-- Prisma Client (seed ด้วย SQL, migration ซ่อมข้อมูล, งาน ops, psql) จะล้มด้วย
--   ERROR: null value in column "updated_at" violates not-null constraint
-- spec กำหนดไว้ชัดว่า `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` จึงเติมให้ครบทุกตารางที่มีคอลัมน์นี้
-- (เจอตอน 1.1 ระหว่างทดสอบ CHECK constraint ด้วย raw SQL)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
      AND table_name <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT NOW()', t);
  END LOOP;
END $$;

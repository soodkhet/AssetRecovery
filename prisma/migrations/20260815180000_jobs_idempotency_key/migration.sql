-- Phase 5.3 — คีย์กันซ้ำของงานเบื้องหลัง (`91` §11/§14 · `01` §11)
--
-- `01` §11 และ `91` §14 บังคับว่า "สร้าง job ต้องมี idempotency_key" และคีย์ซ้ำต้องคืน job เดิม
-- แต่รูปตาราง `jobs` ใน `02` §10 ไม่มีคอลัมน์นี้ และ Rule 02 ห้ามแก้ schema ให้ต่างจาก `02` เงียบ ๆ
-- ⇒ เก็บคีย์ไว้ใน `payload->>'idempotencyKey'` (payload เป็นของ job อยู่แล้ว) แล้วบังคับความไม่ซ้ำ
--    ด้วย **partial unique index บน expression** ตามที่ Rule 02 กำหนดให้ทำผ่าน raw SQL เท่านั้น
--
-- ทำไมต้องเป็น index ไม่ใช่เช็คในโค้ด: สองคำขอที่ยิงพร้อมกันด้วยคีย์เดียวกันจะอ่าน "ยังไม่มี"
-- ได้ทั้งคู่แล้วสร้าง job ซ้อนกัน — ตัวตัดสินต้องอยู่ที่ฐานข้อมูล (ตัวที่แพ้ได้ P2002 แล้วอ่านของเดิมคืน)
-- งานเก่าที่ไม่มีคีย์ (เช่น `fuel_distance_retry` ที่ตั้งไว้ตอนปิดเคส — Phase 2.9) ไม่ถูกกระทบ
-- เพราะ index เป็นแบบ partial

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_idempotency_key
  ON jobs ((payload->>'idempotencyKey'))
  WHERE (payload->>'idempotencyKey') IS NOT NULL;

COMMENT ON INDEX uniq_jobs_idempotency_key IS
  'กัน job ซ้ำจากคีย์ idempotency เดียวกัน (`91` §11 JOB_DUPLICATE → คืน job เดิม) — คีย์อยู่ใน payload เพราะ `02` §10 ไม่มีคอลัมน์';

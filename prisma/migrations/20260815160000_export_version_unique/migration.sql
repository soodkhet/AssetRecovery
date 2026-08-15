-- รีวิว Phase 4 — `export_records.version` ห้ามชนกันเองภายในรอบเดียวกัน (`37` §6.2 · Rule 02)
--
-- เดิมมีแค่ `idx_exports_period` ซึ่งเป็น index ธรรมดา ⇒ สองคนกด "ส่งออก Accounting Pack"
-- ของรอบเดียวกันพร้อมกัน จะอ่าน `MAX(version)` ได้ค่าเดียวกันทั้งคู่แล้วเขียน version ซ้ำ
-- (ตัวที่กันอยู่ตอนนี้คือ `upsert: false` ของ Storage เท่านั้น ซึ่งเป็นผลข้างเคียงของ path ชนกัน
--  ไม่ใช่ยามระดับข้อมูล) — ประวัติการส่งมอบต้องเรียงเวอร์ชันไม่ซ้ำเสมอ เพราะใช้อ้างว่าส่งอะไรไปแล้วบ้าง

CREATE UNIQUE INDEX IF NOT EXISTS uniq_export_period_version
  ON export_records (organization_id, period_id, version);

COMMENT ON INDEX uniq_export_period_version IS
  'กัน version ซ้ำของ Accounting Pack ต่อรอบบัญชี (`37` §6.2) — ห้ามเขียนทับเวอร์ชันเดิม';

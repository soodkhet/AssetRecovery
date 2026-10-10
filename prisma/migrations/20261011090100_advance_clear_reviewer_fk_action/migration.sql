-- แก้ FK action ของ `advances.clear_reviewed_by` (migration 20261010120000) ให้ตรงกับที่ Prisma คาดสำหรับ relation optional
-- (ON DELETE SET NULL ON UPDATE CASCADE) — กัน `prisma migrate diff` เสนอ drop/add ทุกครั้ง · ผู้ใช้ไม่ถูกลบจริง (soft delete)
ALTER TABLE advances DROP CONSTRAINT advances_clear_reviewed_by_fkey;
ALTER TABLE advances
  ADD CONSTRAINT advances_clear_reviewed_by_fkey
  FOREIGN KEY (clear_reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

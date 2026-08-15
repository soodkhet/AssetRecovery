-- รีวิว Phase 5 — index รองรับหน้า "บันทึกการใช้งาน" (`90` §14)
--
-- query หลักของหน้านี้คือ `WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50`
-- แต่ index ที่มี (`idx_audit_target`, `idx_audit_actor`) ขึ้นต้นด้วยคอลัมน์อื่นต่อจาก org
-- ⇒ ต้อง sort แถว audit ทั้งองค์กร (เก็บ 5 ปี) ทุกครั้งที่เปิดหน้า/เปลี่ยนหน้า

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_at
  ON audit_logs (organization_id, created_at DESC);

COMMENT ON INDEX idx_audit_logs_org_created_at IS
  'หน้าบันทึกการใช้งาน (`90` §14) — เรียงล่าสุดก่อนภายในองค์กร';

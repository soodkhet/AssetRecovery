-- Phase 6.3 — เกณฑ์ SLA ของงานติดตาม (มติ PO 15/08/2569 · D18)
--
-- `96` §6-O2/O4 อ้าง `slaAlertHours` แต่ทั้งไฟล์ `03` และ `02` ไม่เคยมีฟิลด์นี้
-- ⇒ PO เคาะให้เก็บระดับองค์กรที่ `assignment_policy_settings` (ตารางค่าตั้งของงานมอบหมาย `40` §6.4)
-- ค่าเริ่มต้น 72 ชั่วโมง = 3 วัน · ใช้เฉพาะรายงาน O2/O4 (อ่านอย่างเดียว ไม่บล็อก flow ใด)

ALTER TABLE assignment_policy_settings
  ADD COLUMN IF NOT EXISTS sla_alert_hours INTEGER NOT NULL DEFAULT 72;

-- ต้องเป็นบวกเสมอ — เกณฑ์ 0 ชั่วโมงทำให้ทุกเคสเกิน SLA ทันทีที่สร้าง (รายงานไร้ความหมาย)
ALTER TABLE assignment_policy_settings
  DROP CONSTRAINT IF EXISTS chk_assignment_policy_sla_alert_hours;
ALTER TABLE assignment_policy_settings
  ADD CONSTRAINT chk_assignment_policy_sla_alert_hours CHECK (sla_alert_hours > 0);

COMMENT ON COLUMN assignment_policy_settings.sla_alert_hours IS
  'เกณฑ์ SLA งานติดตาม (ชั่วโมง) นับจาก cases.created_at — `96` §6-O2/O4 · D18';

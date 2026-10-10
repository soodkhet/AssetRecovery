-- staging E-069 (มติ PO 10/10/2569 — บันทึกทุกครั้งที่ตรวจความพร้อม)
-- ผลตรวจล่าสุดของรอบบัญชี: ผ่านกี่ข้อจากทั้งหมด (แถวแสดง "ตรวจล่าสุด HH:mm · ผ่าน N/M") · ว่างทั้งคู่ = ยังไม่เคยบันทึกผล
ALTER TABLE accounting_periods
  ADD COLUMN last_readiness_passed_count SMALLINT,
  ADD COLUMN last_readiness_total_count  SMALLINT;

ALTER TABLE accounting_periods
  ADD CONSTRAINT chk_accounting_periods_readiness_result CHECK (
    (last_readiness_passed_count IS NULL AND last_readiness_total_count IS NULL)
    OR (last_readiness_total_count > 0
        AND last_readiness_passed_count >= 0
        AND last_readiness_passed_count <= last_readiness_total_count)
  );

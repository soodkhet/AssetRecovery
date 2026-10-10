-- staging E-016 (มติ PO 10/10/2569) — ลดยอดของบิลที่ชำระครบแล้ว: ออกใบลดหนี้ในระบบไม่ได้ (U171 ยอดค้าง = 0)
-- ⇒ การเงินปิดป้าย "รอใบลดหนี้" เป็น "จัดการนอกระบบ" พร้อมเหตุผล (audit) · ไม่ลบ/แก้ Adjustment
ALTER TABLE adjustments
  ADD COLUMN credit_note_waived_at TIMESTAMPTZ,
  ADD COLUMN credit_note_waived_by UUID,
  ADD COLUMN credit_note_waive_reason TEXT;

ALTER TABLE adjustments
  ADD CONSTRAINT adjustments_credit_note_waived_by_fkey
    FOREIGN KEY (credit_note_waived_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT chk_adjustments_credit_note_waive_shape CHECK (
    (credit_note_waived_at IS NULL AND credit_note_waived_by IS NULL AND credit_note_waive_reason IS NULL)
    OR (credit_note_waived_at IS NOT NULL AND credit_note_waived_by IS NOT NULL
        AND credit_note_waive_reason IS NOT NULL AND btrim(credit_note_waive_reason) <> '')
  );

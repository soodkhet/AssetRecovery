-- มติ PO 05/10/2569 (U59) — ผู้ใช้ภายในเปิด "ดู portal ในฐานะลูกค้า" ต้องบันทึก audit
-- `02` §3 enum audit_action เพิ่มค่า view_as
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'view_as';

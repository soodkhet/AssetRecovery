-- มติ PO 05/10/2569 (U6/O43 D4) — พอร์ทัลบริษัทปฏิเสธการเข้าถึง (403) ต้องบันทึก audit
-- `02` §3 enum audit_action เพิ่มค่า access_denied
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'access_denied';

-- มติ PO 06/10/2569 (U90) — เปิดไฟล์ที่มีข้อมูลส่วนบุคคลผ่าน signed URL ต้องบันทึก audit
-- (เอกสารเคส: สัญญา/บัตรประชาชน/เอกสารชุด/เอกสารอื่นจากไฟแนนซ์ · 50 ทวิ ที่ลูกค้าหักเรา)
-- `02` §3 enum audit_action เพิ่มค่า view
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'view';

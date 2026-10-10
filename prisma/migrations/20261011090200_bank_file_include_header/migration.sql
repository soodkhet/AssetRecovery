-- staging E-009 (มติ PO 10/10/2569) — ไฟล์โอนรวม 1 บรรทัดต่อผู้รับ (โค้ด) + ตัวเลือก "มีแถวหัวคอลัมน์" ต่อรูปแบบไฟล์ธนาคาร
ALTER TABLE bank_file_formats ADD COLUMN include_header BOOLEAN NOT NULL DEFAULT false;

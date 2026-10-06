-- สถานะ "ยกเลิก" ของใบรับรองแทนใบเสร็จรับเงิน (มติ PO 06/10/2569 U107 · `23` §6.17 · `02` v4.44)
-- แยก migration: ค่า enum ใหม่ใช้ในทรานแซกชันเดียวกับ ALTER TYPE ... ADD VALUE ไม่ได้ (CHECK/trigger อยู่ไฟล์ถัดไป)
ALTER TYPE "substitute_receipt_status" ADD VALUE 'cancelled';

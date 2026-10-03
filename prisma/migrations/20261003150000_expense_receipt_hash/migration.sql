-- ขยายมติ PO 03/10/2569 (UAT Q13) ถึงใบเสร็จรายการเบิกแยก (UAT BUG-072 · `02` v4.10)
-- server ดาวน์โหลดใบเสร็จมาตรวจเอง (path ใต้ expenses/<userId>/receipts/ · มีจริง · magic bytes · ขนาด)
-- แล้วเก็บ SHA-256 ที่คำนวณเอง · แถวเดิม = NULL (ยังไม่เคยตรวจ)

ALTER TABLE "expenses" ADD COLUMN "receipt_file_hash" VARCHAR(64);

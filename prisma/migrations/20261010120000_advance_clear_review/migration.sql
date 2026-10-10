-- staging E-012 (มติ PO 10/10/2569) — การเงินตรวจการเคลียร์เงินทดรอง + เปิดดูใบเสร็จที่แนบตอนเคลียร์
-- (1) ใบเสร็จตอนเคลียร์ยอด: เดิมเก็บใน audit `after_data.receipt_file_url/hash` เท่านั้น ⇒ ย้ายมาเป็นคอลัมน์ของเงินทดรอง
ALTER TABLE "advances" ADD COLUMN "receipt_file_url" TEXT;
ALTER TABLE "advances" ADD COLUMN "receipt_file_hash" TEXT;

-- (2) ตรวจการเคลียร์แล้ว — ไม่ใช่สถานะใหม่ (สถานะยังเป็น `cleared`) · มีค่าได้เฉพาะ `cleared` (ตีกลับการเคลียร์ล้างค่าทิ้ง)
ALTER TABLE "advances" ADD COLUMN "clear_reviewed_at" TIMESTAMPTZ(6);
ALTER TABLE "advances" ADD COLUMN "clear_reviewed_by" UUID;
ALTER TABLE "advances" ADD CONSTRAINT "advances_clear_reviewed_by_fkey"
  FOREIGN KEY ("clear_reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "chk_advances_clear_review_shape"
  CHECK (
    ("clear_reviewed_at" IS NULL AND "clear_reviewed_by" IS NULL)
    OR ("clear_reviewed_at" IS NOT NULL AND "clear_reviewed_by" IS NOT NULL AND "status" = 'cleared')
  );
-- ใบเสร็จมีได้เฉพาะเงินทดรองที่เคลียร์แล้ว
ALTER TABLE "advances" ADD CONSTRAINT "chk_advances_receipt_cleared_only"
  CHECK ("receipt_file_url" IS NULL OR "status" = 'cleared');

-- backfill ใบเสร็จของเงินทดรองที่เคลียร์ไปแล้ว — audit การเคลียร์ล่าสุดของแต่ละใบ (audit ไม่ถูกแก้ — อ่านอย่างเดียว)
UPDATE "advances" a
   SET "receipt_file_url" = src.url,
       "receipt_file_hash" = src.hash
  FROM (
    SELECT DISTINCT ON (l."target_id")
           l."target_id" AS advance_id,
           l."after_data" ->> 'receipt_file_url' AS url,
           l."after_data" ->> 'receipt_file_hash' AS hash
      FROM "audit_logs" l
     WHERE l."target_type" = 'advances'
       AND l."after_data" ->> 'status' = 'cleared'
       AND l."after_data" ? 'receipt_file_url'
     ORDER BY l."target_id", l."created_at" DESC
  ) src
 WHERE a."id" = src.advance_id
   AND a."status" = 'cleared'
   AND src.url IS NOT NULL;

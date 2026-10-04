-- มติ PO 04/10/2569 (UAT — ติ๊กรูปสินค้า/จำโหมด/ลบเอกสาร · `02` v4.15 · `38` v3.4)
-- 1) จำโหมดเอกสารแนบของเคส (separate = แยกตามประเภท · bundle = เอกสารชุดเดียว สแกนรวมเล่ม)
ALTER TABLE "cases" ADD COLUMN "document_mode" TEXT NOT NULL DEFAULT 'separate';
ALTER TABLE "cases" ADD CONSTRAINT "chk_cases_document_mode" CHECK ("document_mode" IN ('separate', 'bundle'));

-- 2) โหมดแยกประเภท: รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว ⇒ ไม่บังคับรูปสินค้าก่อนส่งตรวจ
ALTER TABLE "cases" ADD COLUMN "product_photo_in_contract" BOOLEAN NOT NULL DEFAULT false;

-- 3) backfill: เคสที่มีเอกสารชุด (ยังไม่ถูกลบ) อยู่แล้ว = โหมดชุด
UPDATE "cases" c SET "document_mode" = 'bundle'
WHERE EXISTS (
  SELECT 1 FROM "case_documents" d
  WHERE d."case_id" = c."id" AND d."document_type" = 'bundle_doc' AND d."deleted_at" IS NULL
);

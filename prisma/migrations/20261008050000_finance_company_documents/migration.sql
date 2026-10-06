-- มติ PO U132 (07/10/2569) — เอกสารบริษัทไฟแนนซ์: หนังสือรับรองบริษัท (+ วันที่ออก) · ภ.พ.20 · สัญญาว่าจ้าง
-- · หน้าสมุดบัญชีธนาคาร (ไม่บังคับ) · อื่น ๆ (ระบุชื่อ)
--
-- insert-only เก็บทุกเวอร์ชัน: แทนที่ = แถวใหม่ที่ชี้ `replaces_document_id` ไปเวอร์ชันก่อน · ห้ามลบ/แก้ (trigger)
-- ไฟล์อยู่ใน bucket `case-documents` path ต่อเวอร์ชัน (DEC-014) + SHA-256 ที่ server ตรวจเอง

-- CreateEnum
CREATE TYPE "company_document_type" AS ENUM ('company_certificate', 'vat_registration', 'service_contract', 'bank_book', 'other');

-- CreateTable
CREATE TABLE "finance_company_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "document_type" "company_document_type" NOT NULL,
    "title" TEXT,
    "issued_date" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replaces_document_id" UUID,
    "file_path" TEXT NOT NULL,
    "file_sha256" VARCHAR(64) NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "finance_company_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_company_documents_replaces_document_id_key" ON "finance_company_documents"("replaces_document_id");
CREATE INDEX "idx_finance_company_documents_org_company" ON "finance_company_documents"("organization_id", "company_id", "document_type");
CREATE UNIQUE INDEX "finance_company_documents_organization_id_file_path_key" ON "finance_company_documents"("organization_id", "file_path");

-- AddForeignKey
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "finance_company_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "finance_company_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "finance_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "finance_company_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "finance_company_documents_replaces_document_id_fkey" FOREIGN KEY ("replaces_document_id") REFERENCES "finance_company_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── raw SQL (Prisma ไม่รองรับ) ───────────────────────────────────────────────

-- รูปร่างตามชนิด: ชื่อเอกสารมีเฉพาะ "อื่น ๆ" (และต้องมี) · วันที่ออกมีเฉพาะหนังสือรับรอง (และต้องมี)
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "chk_company_documents_title_shape" CHECK (
  (document_type = 'other' AND title IS NOT NULL AND length(btrim(title)) > 0)
  OR (document_type <> 'other' AND title IS NULL)
);
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "chk_company_documents_issued_date_shape" CHECK (
  (document_type = 'company_certificate' AND issued_date IS NOT NULL)
  OR (document_type <> 'company_certificate' AND issued_date IS NULL)
);
-- เวอร์ชันแรกไม่มีตัวก่อนหน้า · เวอร์ชันถัดไปต้องชี้ตัวก่อนหน้าเสมอ
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "chk_company_documents_version_chain" CHECK (
  version >= 1 AND ((version = 1) = (replaces_document_id IS NULL))
);
ALTER TABLE "finance_company_documents" ADD CONSTRAINT "chk_company_documents_file" CHECK (
  size_bytes > 0 AND file_sha256 ~ '^[0-9a-f]{64}$'
);

-- ชนิดเดี่ยว (ทุกชนิดยกเว้น "อื่น ๆ") มีได้ 1 สายเวอร์ชันต่อบริษัท — เวอร์ชันแรกซ้ำไม่ได้
-- (สายต่อไปผูกด้วย UNIQUE replaces_document_id ⇒ ไม่แตกสาย แม้สองคนกดแทนที่พร้อมกัน)
CREATE UNIQUE INDEX "uniq_company_documents_first_singleton" ON "finance_company_documents"("company_id", "document_type")
  WHERE version = 1 AND document_type <> 'other';

-- Immutable: ห้าม UPDATE/DELETE/TRUNCATE (เก็บทุกเวอร์ชัน — แทนที่ = แถวใหม่)
CREATE OR REPLACE FUNCTION finance_company_documents_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMPANY_DOCUMENT_IMMUTABLE: ห้าม % ตาราง finance_company_documents — แนบใหม่เป็นเวอร์ชันใหม่เท่านั้น (มติ PO U132)', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_finance_company_documents_immutable
  BEFORE UPDATE OR DELETE ON "finance_company_documents"
  FOR EACH ROW EXECUTE FUNCTION finance_company_documents_immutable();

CREATE TRIGGER trg_finance_company_documents_no_truncate
  BEFORE TRUNCATE ON "finance_company_documents"
  FOR EACH STATEMENT EXECUTE FUNCTION finance_company_documents_immutable();

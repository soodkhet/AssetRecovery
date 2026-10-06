-- มติ PO 06/10/2569 U122 — เทมเพลตเอกสารมีผลจริง (ข้อความท้าย + รูปลายเซ็น)
--
-- หลัก: ใช้ร่วมทุกเอกสาร → organizations (ข้อมูลองค์กร) · ต่างกันตามชนิด → tax_document_template_settings
--
-- ① organizations.signature_path / signature_sha256 — รูปลายเซ็นผู้มีอำนาจ (ไม่บังคับ · อัปโหลดผ่าน server แบบโลโก้)
--    path ต่อเวอร์ชัน `organization/<orgId>/signature/<uuid>.<ext>` · เปลี่ยน/ลบไม่ลบไฟล์เดิม
-- ② tax_document_template_settings (แท็บ "เทมเพลตเอกสาร"):
--    - ชนิดเอกสาร: tax_invoice / wht_certificate → billing_invoice / tax_invoice / handover_note
--      (แถว wht_certificate ถูกลบ — 50 ทวิ ใช้แบบทางการ ไม่มีค่าตั้ง · ค่าเดิมยังอยู่ใน audit_logs)
--    - ตัด logo_url (ซ้ำโลโก้ของข้อมูลองค์กร) · signature_image_url (แทนด้วยรูปอัปโหลดใน ①)
--      · paper_size / language (แบบเอกสารตายตัว A4 ภาษาไทย) — ไม่เคยถูกใช้พิมพ์
--    - เพิ่ม print_signature (เปิด/ปิดพิมพ์รูปลายเซ็นต่อชนิด · ค่าเริ่มต้นปิด)
-- ③ document_template_snapshot JSONB `{ footer_note, signature_path, signature_sha256 }` บน
--    tax_invoices (ตอนออก) · billing_batches (ตอนส่งรอบ) · handover_lots (ตอนยืนยันล็อต)
--    เอกสารก่อน U122 = NULL ⇒ ไม่พิมพ์ข้อความท้าย/ลายเซ็น (ไม่ดึงค่าปัจจุบัน) · ไม่ backfill

-- ①
ALTER TABLE "organizations" ADD COLUMN "signature_path" TEXT;
ALTER TABLE "organizations" ADD COLUMN "signature_sha256" VARCHAR(64);
ALTER TABLE "organizations"
  ADD CONSTRAINT "chk_organizations_signature_sha256"
  CHECK ("signature_sha256" IS NULL OR "signature_sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "organizations"
  ADD CONSTRAINT "chk_organizations_signature_pair"
  CHECK (("signature_path" IS NULL) = ("signature_sha256" IS NULL));

-- ②
CREATE TYPE "template_document_type" AS ENUM ('billing_invoice', 'tax_invoice', 'handover_note');

DELETE FROM "tax_document_template_settings" WHERE "document_type" = 'wht_certificate';

ALTER TABLE "tax_document_template_settings"
  ALTER COLUMN "document_type" TYPE "template_document_type"
  USING ("document_type"::text::"template_document_type");

ALTER TABLE "tax_document_template_settings"
  DROP COLUMN "logo_url",
  DROP COLUMN "signature_image_url",
  DROP COLUMN "paper_size",
  DROP COLUMN "language",
  ADD COLUMN "print_signature" BOOLEAN NOT NULL DEFAULT false;

DROP TYPE "tax_document_type";
DROP TYPE "tax_doc_paper_size";
DROP TYPE "tax_doc_language";

-- ③
ALTER TABLE "tax_invoices" ADD COLUMN "document_template_snapshot" JSONB;
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_document_template_snapshot_object"
  CHECK ("document_template_snapshot" IS NULL OR jsonb_typeof("document_template_snapshot") = 'object');

ALTER TABLE "billing_batches" ADD COLUMN "document_template_snapshot" JSONB;
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_document_template_snapshot_object"
  CHECK ("document_template_snapshot" IS NULL OR jsonb_typeof("document_template_snapshot") = 'object');

ALTER TABLE "handover_lots" ADD COLUMN "document_template_snapshot" JSONB;
ALTER TABLE "handover_lots"
  ADD CONSTRAINT "chk_handover_lots_document_template_snapshot"
  CHECK (
    "document_template_snapshot" IS NULL
    OR ("status" = 'confirmed' AND jsonb_typeof("document_template_snapshot") = 'object')
  );

-- ใบแจ้งหนี้ที่ส่งแล้ว: snapshot เทมเพลตแก้ไม่ได้ (เพิ่มคอลัมน์ในชุดเดิมของ trigger party snapshot)
CREATE OR REPLACE FUNCTION billing_batches_party_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."seller_name" IS NOT NULL AND (
       NEW."seller_name"                IS DISTINCT FROM OLD."seller_name"
    OR NEW."seller_tax_id"              IS DISTINCT FROM OLD."seller_tax_id"
    OR NEW."seller_address"             IS DISTINCT FROM OLD."seller_address"
    OR NEW."seller_phone"               IS DISTINCT FROM OLD."seller_phone"
    OR NEW."seller_branch_code"         IS DISTINCT FROM OLD."seller_branch_code"
    OR NEW."seller_profile_snapshot"    IS DISTINCT FROM OLD."seller_profile_snapshot"
    OR NEW."document_template_snapshot" IS DISTINCT FROM OLD."document_template_snapshot"
    OR NEW."buyer_name"                 IS DISTINCT FROM OLD."buyer_name"
    OR NEW."buyer_tax_id"               IS DISTINCT FROM OLD."buyer_tax_id"
    OR NEW."buyer_address"              IS DISTINCT FROM OLD."buyer_address"
    OR NEW."buyer_phone"                IS DISTINCT FROM OLD."buyer_phone"
    OR NEW."buyer_branch_code"          IS DISTINCT FROM OLD."buyer_branch_code"
  ) THEN
    RAISE EXCEPTION 'BILLING_PARTY_SNAPSHOT_IMMUTABLE: รอบวางบิล % ส่งแล้ว — ข้อมูลผู้ขาย/ผู้ซื้อบนใบแจ้งหนี้แก้ไม่ได้',
      OLD."batch_number" USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

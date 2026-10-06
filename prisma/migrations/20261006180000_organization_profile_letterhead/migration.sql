-- หน้า "ข้อมูลองค์กร" + หัวเอกสารกลาง (มติ PO 06/10/2569 U99)
--
-- ① organizations: ชื่ออังกฤษ · เว็บไซต์ · ที่อยู่แยก 5 ช่อง (คง `address` บรรทัดเดียวไว้ — snapshot ของเอกสารอ่านบรรทัดนี้)
--    `logo_url` มีอยู่แล้ว (เก็บ path ใน bucket `case-documents`)
-- ② snapshot หัวเอกสารส่วนที่เพิ่ม (ชื่ออังกฤษ/อีเมล/เว็บไซต์/path โลโก้) บนใบกำกับภาษี + รอบวางบิล
--    NULL = เอกสารที่ออกก่อน U99 ⇒ PDF ใช้ค่าปัจจุบันขององค์กรเฉพาะฟิลด์ชุดนี้ (ฟิลด์ที่ snapshot ไว้เดิมไม่เปลี่ยน)
--    · tax_invoices: ยาม `tax_invoices_immutable()` เทียบทั้งแถว (to_jsonb) ⇒ คอลัมน์ใหม่ถูกคุมอัตโนมัติ
--    · billing_batches: เพิ่มคอลัมน์ใหม่เข้ายาม `billing_batches_party_snapshot_immutable()`
-- ไม่ backfill โดยเจตนา — ไม่รู้ค่า ณ วันออกเอกสารเดิม

-- ①
ALTER TABLE "organizations"
  ADD COLUMN "name_en" TEXT,
  ADD COLUMN "website" VARCHAR(255),
  ADD COLUMN "address_detail" TEXT,
  ADD COLUMN "address_subdistrict" TEXT,
  ADD COLUMN "address_district" TEXT,
  ADD COLUMN "address_province" TEXT,
  ADD COLUMN "address_postal_code" VARCHAR(5);

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_address_postal_code_format"
  CHECK ("address_postal_code" IS NULL OR "address_postal_code" ~ '^[0-9]{5}$');

-- ②
ALTER TABLE "tax_invoices" ADD COLUMN "seller_profile_snapshot" JSONB;
ALTER TABLE "billing_batches" ADD COLUMN "seller_profile_snapshot" JSONB;

ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_seller_profile_snapshot_object"
  CHECK ("seller_profile_snapshot" IS NULL OR jsonb_typeof("seller_profile_snapshot") = 'object');
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_seller_profile_snapshot_object"
  CHECK ("seller_profile_snapshot" IS NULL OR jsonb_typeof("seller_profile_snapshot") = 'object');

CREATE OR REPLACE FUNCTION billing_batches_party_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."seller_name" IS NOT NULL AND (
       NEW."seller_name"             IS DISTINCT FROM OLD."seller_name"
    OR NEW."seller_tax_id"           IS DISTINCT FROM OLD."seller_tax_id"
    OR NEW."seller_address"          IS DISTINCT FROM OLD."seller_address"
    OR NEW."seller_phone"            IS DISTINCT FROM OLD."seller_phone"
    OR NEW."seller_branch_code"      IS DISTINCT FROM OLD."seller_branch_code"
    OR NEW."seller_profile_snapshot" IS DISTINCT FROM OLD."seller_profile_snapshot"
    OR NEW."buyer_name"              IS DISTINCT FROM OLD."buyer_name"
    OR NEW."buyer_tax_id"            IS DISTINCT FROM OLD."buyer_tax_id"
    OR NEW."buyer_address"           IS DISTINCT FROM OLD."buyer_address"
    OR NEW."buyer_phone"             IS DISTINCT FROM OLD."buyer_phone"
    OR NEW."buyer_branch_code"       IS DISTINCT FROM OLD."buyer_branch_code"
  ) THEN
    RAISE EXCEPTION 'BILLING_PARTY_SNAPSHOT_IMMUTABLE: รอบวางบิล % ส่งแล้ว — ข้อมูลผู้ขาย/ผู้ซื้อบนใบแจ้งหนี้แก้ไม่ได้',
      OLD."batch_number" USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

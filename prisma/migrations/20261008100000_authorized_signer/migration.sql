-- มติ PO 07/10/2569 U151 — ผู้มีอำนาจลงนามบนเอกสารส่งออกนอก
--
-- ① `organizations` — ชื่อ + ตำแหน่งผู้มีอำนาจลงนาม (ไม่บังคับ · คู่รูปลายเซ็น U122)
--    พิมพ์บนใบแจ้งหนี้ · ใบเสร็จ/ใบกำกับภาษี · ใบส่งมอบ (ผู้ส่งมอบ) ผ่าน `document_template_snapshot` (JSONB เดิม —
--    เพิ่มคีย์ `signer_name`/`signer_title` ไม่ต้องแก้ schema ของตารางเอกสาร) · 50 ทวิ ผ่านคอลัมน์ snapshot ด้านล่าง
-- ② `wht_certificates` — snapshot ผู้ลงนามฝั่งผู้จ่ายเงิน ณ วันออกใบ · ใบเก่า = NULL (ไม่พิมพ์ชื่อ — ไม่เติมย้อนหลัง)
--    + ยาม immutable รวม 2 คอลัมน์ใหม่ (ใบ active แก้ได้ทางเดียวคือยกเลิก)

ALTER TABLE "organizations"
  ADD COLUMN "authorized_signer_name" TEXT,
  ADD COLUMN "authorized_signer_title" TEXT;

ALTER TABLE "wht_certificates"
  ADD COLUMN "payer_signer_name" TEXT,
  ADD COLUMN "payer_signer_title" TEXT;

CREATE OR REPLACE FUNCTION wht_certificates_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WHT_CERTIFICATE_IMMUTABLE: ใบหัก ณ ที่จ่าย % ลบไม่ได้ — ยกเลิกเท่านั้น (02 §13 / 33 §9)',
      OLD.certificate_number USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'WHT_CERTIFICATE_IMMUTABLE: ใบหัก ณ ที่จ่าย % ถูกยกเลิกแล้ว ห้ามแก้/ห้าม reverse — ออกใบใหม่ที่อ้าง replaces_certificate_id แทน (02 §13 / DEC-006 D4)',
      OLD.certificate_number USING ERRCODE = '42501';
  END IF;

  -- ใบที่ยัง active: ยอมให้เปลี่ยนได้ทางเดียวคือยกเลิก · ตัวเลข/ตัวตน/snapshot คู่สัญญาของใบห้ามขยับ
  IF NEW.status <> 'cancelled'
     OR NEW.certificate_number  <> OLD.certificate_number
     OR NEW.gross_satang        <> OLD.gross_satang
     OR NEW.wht_satang          <> OLD.wht_satang
     OR NEW.payment_date        <> OLD.payment_date
     OR NEW.payee_id            <> OLD.payee_id
     OR NEW.expense_record_id   <> OLD.expense_record_id
     OR NEW.organization_id     <> OLD.organization_id
     OR NEW.payee_name          IS DISTINCT FROM OLD.payee_name
     OR NEW.payee_name_title    IS DISTINCT FROM OLD.payee_name_title
     OR NEW.payee_type          IS DISTINCT FROM OLD.payee_type
     OR NEW.payee_tax_id        IS DISTINCT FROM OLD.payee_tax_id
     OR NEW.payee_address       IS DISTINCT FROM OLD.payee_address
     OR NEW.payee_branch_code   IS DISTINCT FROM OLD.payee_branch_code
     OR NEW.wht_condition       IS DISTINCT FROM OLD.wht_condition
     OR NEW.payer_name          IS DISTINCT FROM OLD.payer_name
     OR NEW.payer_tax_id        IS DISTINCT FROM OLD.payer_tax_id
     OR NEW.payer_address       IS DISTINCT FROM OLD.payer_address
     OR NEW.payer_branch_code   IS DISTINCT FROM OLD.payer_branch_code
     OR NEW.payer_signer_name   IS DISTINCT FROM OLD.payer_signer_name
     OR NEW.payer_signer_title  IS DISTINCT FROM OLD.payer_signer_title THEN
    RAISE EXCEPTION 'WHT_CERTIFICATE_IMMUTABLE: ใบหัก ณ ที่จ่าย % แก้ได้ทางเดียวคือยกเลิก (02 §13 / 33 §10)',
      OLD.certificate_number USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

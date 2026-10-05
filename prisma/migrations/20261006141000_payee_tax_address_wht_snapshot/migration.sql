-- ผู้รับเงิน: คำนำหน้า/ที่อยู่/สาขา/เงื่อนไขการหัก + snapshot ผู้ถูกหัก/ผู้หักบนใบ 50 ทวิ
-- มติ PO 06/10/2569 (UAT U94 ข้อ 1 — ปิด D15 · U96 #4 · #13) · `18` §7.1 · `33` §7.1 · `02` §8/§9
--
-- ① payee_profiles — ข้อมูลภาษีที่แบบ 50 ทวิ ต้องใช้ (ม.50 ทวิ): คำนำหน้า · ที่อยู่ 5 ช่อง (โครงเดียวกับที่อยู่ของเคส)
--    · สาขา (นิติบุคคล) · เงื่อนไขการหัก (1) หัก ณ ที่จ่าย [ค่าเริ่มต้น] / (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว
--    ข้อมูลเดิม: ที่อยู่ว่าง (ต้องกรอกก่อนยืนยันครั้งถัดไป — รายที่ยืนยันแล้วไม่ถูกถอนสถานะย้อนหลัง) · สาขา = สำนักงานใหญ่ · เงื่อนไข = (1)
-- ② wht_certificates — snapshot ชื่อ/คำนำหน้า/ประเภท/เลขผู้เสียภาษี/ที่อยู่/สาขา/เงื่อนไขการหักของผู้ถูกหัก
--    + ชื่อ/เลขผู้เสียภาษี/ที่อยู่/สาขาของผู้หัก (องค์กร) ณ วันออกใบ — immutable (Rule 08)
--    ใบเดิมเติมจากค่าปัจจุบัน ณ วัน migrate (ปิดยาม immutable ชั่วคราวเฉพาะคำสั่ง backfill)

-- CreateEnum
CREATE TYPE "wht_condition" AS ENUM ('withhold', 'pay_always', 'pay_once');

-- ① AlterTable payee_profiles
ALTER TABLE "payee_profiles"
  ADD COLUMN "name_title" VARCHAR(50),
  ADD COLUMN "address_detail" TEXT,
  ADD COLUMN "address_subdistrict" TEXT,
  ADD COLUMN "address_district" TEXT,
  ADD COLUMN "address_province" TEXT,
  ADD COLUMN "address_postal_code" VARCHAR(5),
  ADD COLUMN "branch_code" VARCHAR(5) NOT NULL DEFAULT '00000',
  ADD COLUMN "wht_condition" "wht_condition" NOT NULL DEFAULT 'withhold';

ALTER TABLE "payee_profiles" ADD CONSTRAINT "chk_payee_profiles_branch_code"
  CHECK (branch_code ~ '^[0-9]{5}$');
ALTER TABLE "payee_profiles" ADD CONSTRAINT "chk_payee_profiles_address_postal_code"
  CHECK (address_postal_code IS NULL OR address_postal_code ~ '^[0-9]{5}$');

-- ② AlterTable wht_certificates — เพิ่มแบบ nullable ก่อน แล้ว backfill แล้วจึงบังคับ NOT NULL
ALTER TABLE "wht_certificates"
  ADD COLUMN "payee_name" TEXT,
  ADD COLUMN "payee_name_title" VARCHAR(50),
  ADD COLUMN "payee_type" "payee_type",
  ADD COLUMN "payee_tax_id" VARCHAR(13),
  ADD COLUMN "payee_address" TEXT,
  ADD COLUMN "payee_branch_code" VARCHAR(5),
  ADD COLUMN "wht_condition" "wht_condition",
  ADD COLUMN "payer_name" TEXT,
  ADD COLUMN "payer_tax_id" VARCHAR(13),
  ADD COLUMN "payer_address" TEXT,
  ADD COLUMN "payer_branch_code" VARCHAR(5);

ALTER TABLE "wht_certificates" DISABLE TRIGGER trg_wht_certificates_no_update;

-- ที่อยู่/คำนำหน้าของผู้รับเพิ่งเกิดใน migration นี้ (ยังว่างทุกแถว) ⇒ ใบเดิมได้ NULL ซึ่งพิมพ์เป็น "—" ตามเดิม
UPDATE "wht_certificates" AS c
SET payee_name        = u.full_name,
    payee_name_title  = p.name_title,
    payee_type        = p.payee_type,
    payee_tax_id      = p.national_id,
    payee_address     = NULL,
    payee_branch_code = CASE WHEN p.payee_type = 'corporate' THEN p.branch_code ELSE NULL END,
    wht_condition     = p.wht_condition,
    payer_name        = o.name,
    payer_tax_id      = o.tax_id,
    payer_address     = o.address,
    payer_branch_code = o.branch_code
FROM "payee_profiles" AS p
JOIN "users" AS u ON u.id = p.user_id
JOIN "organizations" AS o ON o.id = p.organization_id
WHERE p.id = c.payee_id;

ALTER TABLE "wht_certificates" ENABLE TRIGGER trg_wht_certificates_no_update;

ALTER TABLE "wht_certificates"
  ALTER COLUMN "payee_name" SET NOT NULL,
  ALTER COLUMN "payee_type" SET NOT NULL,
  ALTER COLUMN "wht_condition" SET NOT NULL,
  ALTER COLUMN "payer_name" SET NOT NULL,
  ALTER COLUMN "payer_tax_id" SET NOT NULL,
  ALTER COLUMN "payer_address" SET NOT NULL,
  ALTER COLUMN "payer_branch_code" SET NOT NULL;

ALTER TABLE "wht_certificates" ADD CONSTRAINT "chk_wht_certificates_payee_branch_code"
  CHECK (payee_branch_code IS NULL OR payee_branch_code ~ '^[0-9]{5}$');
ALTER TABLE "wht_certificates" ADD CONSTRAINT "chk_wht_certificates_payer_branch_code"
  CHECK (payer_branch_code ~ '^[0-9]{5}$');

-- ยาม immutable (`02` §13) — snapshot คู่สัญญาเปลี่ยนไม่ได้เหมือนยอด/เลขที่ (ใบ active แก้ได้ทางเดียวคือยกเลิก)
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
     OR NEW.payer_branch_code   IS DISTINCT FROM OLD.payer_branch_code THEN
    RAISE EXCEPTION 'WHT_CERTIFICATE_IMMUTABLE: ใบหัก ณ ที่จ่าย % แก้ได้ทางเดียวคือยกเลิก (02 §13 / 33 §10)',
      OLD.certificate_number USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

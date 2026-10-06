-- มติ PO U125 + U126 (07/10/2569)
-- U125: ตัดสวิตช์ charge_per_tracking_round — คิดค่าบริการทุกรอบติดตามอิสระเสมอ (โค้ดทำแบบนี้อยู่แล้ว)
-- U126: ตัดฐาน asset_value ออกจาก enum service_fee_basis — เหลือ debt_amount อย่างเดียว
--       แถวที่ใช้ asset_value อยู่ แปลงเป็น debt_amount ไม่ได้ (คนละฐานเงิน) ⇒ หยุด migration ให้คนตัดสินใจ

-- U125
ALTER TABLE "service_fee_templates" DROP COLUMN "charge_per_tracking_round";

-- U126 — guard: ห้ามมีข้อมูลใช้ asset_value ค้าง
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "service_fee_templates" WHERE "basis" = 'asset_value')
     OR EXISTS (SELECT 1 FROM "cases" WHERE "service_fee_basis_snapshot" = 'asset_value') THEN
    RAISE EXCEPTION 'U126: ยังมีเทมเพลต/เคสที่ใช้ฐาน asset_value — ต้องตัดสินใจย้ายข้อมูลก่อน migrate';
  END IF;
END $$;

ALTER TYPE "service_fee_basis" RENAME TO "service_fee_basis_old";
CREATE TYPE "service_fee_basis" AS ENUM ('debt_amount');
ALTER TABLE "service_fee_templates"
  ALTER COLUMN "basis" TYPE "service_fee_basis" USING ("basis"::text::"service_fee_basis");
ALTER TABLE "cases"
  ALTER COLUMN "service_fee_basis_snapshot" TYPE "service_fee_basis" USING ("service_fee_basis_snapshot"::text::"service_fee_basis");
DROP TYPE "service_fee_basis_old";

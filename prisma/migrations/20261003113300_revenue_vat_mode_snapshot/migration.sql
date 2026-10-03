-- มติ PO 03/10/2569 (UAT Q6, BUG-015) — snapshot `vat_mode` ของบริษัทลง `revenues` ตอนสร้าง
-- (`02` §8 revenues · `92` §7.1 snapshot pattern) ป้าย VAT ของรายได้เก่าต้องไม่เปลี่ยนตามบริษัท

-- AlterTable
ALTER TABLE "revenues" ADD COLUMN "vat_mode_snapshot" "vat_mode";

-- Backfill แถวเดิม: ใช้ `vat_mode` ปัจจุบันของบริษัท (ไม่มีประวัติเก่าให้ย้อน) แต่แก้คู่ที่เป็นไปไม่ได้
-- ตามตัวเลขที่ snapshot ไว้แล้ว — `vat_rate_pct_used = 0` เกิดจาก `no_vat` เท่านั้น (revenue-builder)
-- และอัตรา > 0 แปลว่าตอนสร้างไม่ใช่ `no_vat` (แยก include/exclude จากตัวเลขไม่ได้ ⇒ ใช้ค่าเริ่มต้น exclude_vat)
UPDATE "revenues" AS r
SET "vat_mode_snapshot" = CASE
  WHEN r."vat_rate_pct_used" = 0 THEN 'no_vat'::"vat_mode"
  WHEN fc."vat_mode" = 'no_vat' THEN 'exclude_vat'::"vat_mode"
  ELSE fc."vat_mode"
END
FROM "finance_companies" AS fc
WHERE fc."id" = r."company_id";

ALTER TABLE "revenues" ALTER COLUMN "vat_mode_snapshot" SET NOT NULL;

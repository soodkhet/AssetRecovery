-- มติ PO 06/10/2569 (U96 #14) — ใบเบิกค่าที่พักระบุว่า "ใบเสร็จออกในนามบริษัท" หรือไม่ (ผู้เบิกติ๊กเอง · ค่าเริ่มต้นไม่ติ๊ก)
-- ใช้ส่งรายการให้สำนักงานบัญชีพิจารณาฐานหัก ณ ที่จ่าย (U3) — ไม่เปลี่ยนสูตร WHT (`02` v4.36 · `41` §6.6 · `37` 03_Expenses)
ALTER TABLE "expenses" ADD COLUMN "receipt_in_company_name" BOOLEAN NOT NULL DEFAULT false;

-- ติ๊กได้เฉพาะค่าที่พัก — รายการชนิดอื่นต้องเป็น false เสมอ
ALTER TABLE "expenses"
  ADD CONSTRAINT "chk_expenses_receipt_in_company_name_hotel_only"
  CHECK ("expense_type" = 'hotel' OR "receipt_in_company_name" = false);

-- มติ PO O50 (06/10/2569) — ใบเบิกค่าที่พักระบุจำนวนคืนได้ (ไม่บังคับ ค่าเริ่มต้น 1)
-- เพดานค่าที่พัก = hotel_max_per_night_satang × hotel_nights (`22` §6.15 · `41` §6.6 · `02` v4.34)
ALTER TABLE "expenses" ADD COLUMN "hotel_nights" INTEGER NOT NULL DEFAULT 1;

-- จำนวนคืน 1–31 (ตรง Zod `hotelNightsSchema`) · รายการที่ไม่ใช่ค่าที่พักต้องเป็น 1 เสมอ
ALTER TABLE "expenses"
  ADD CONSTRAINT "chk_expenses_hotel_nights_range" CHECK ("hotel_nights" BETWEEN 1 AND 31),
  ADD CONSTRAINT "chk_expenses_hotel_nights_hotel_only" CHECK ("expense_type" = 'hotel' OR "hotel_nights" = 1);

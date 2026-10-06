-- มติ O77 (07/10/2569) — คลังรับเข้า "สี/ความจุตรงกับสัญญา" เป็นตัวเลือกบังคับ ตรง/ไม่ตรง
-- ไม่ตรง ⇒ ระบุสิ่งที่พบ (ข้อความ) เก็บที่ `assets.color_capacity_note` · ตรง/ยังไม่ตรวจ = NULL
ALTER TABLE "assets" ADD COLUMN "color_capacity_note" TEXT;

-- มีข้อความได้เฉพาะแถวที่ผลตรวจ = ไม่ตรง (แถวเดิม `false` ก่อนมติ ไม่มีข้อความ — ไม่บังคับย้อนหลัง · บังคับที่ service)
ALTER TABLE "assets" ADD CONSTRAINT "chk_assets_color_capacity_note"
  CHECK ("color_capacity_note" IS NULL OR "color_capacity_matched" = false);

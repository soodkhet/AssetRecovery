-- มติ PO 03/10/2569 (UAT Q16 · BUG-057): ปิดงานไม่สำเร็จต้องเลือกเหตุผล (รายการมาตรฐาน + ช่องอธิบาย)
-- (`02` v4.7 · `41` §6.4/§12)
--
-- เก็บ "รหัสเหตุผล" เป็น TEXT (ไม่ใช่ PG enum) โดยตั้งใจ — รายการอยู่ที่ `CLOSE_FAIL_REASONS`
-- (`lib/field/fail-reasons.ts`) ⇒ PO ปรับ/เพิ่มรายการได้ภายหลังโดยไม่ต้องแก้ schema
-- (แถวที่บันทึกด้วยรหัสที่เลิกใช้แล้วยังอ่านกลับได้ — ป้ายแสดงตกไปที่รหัสดิบ)

ALTER TABLE "case_evidences"
  ADD COLUMN "fail_reason" TEXT,
  ADD COLUMN "fail_reason_detail" TEXT;

-- เหตุผลมีความหมายเฉพาะเคสไม่สำเร็จ — แถวเดิมทุกแถวเป็น NULL จึงผ่าน CHECK
ALTER TABLE "case_evidences"
  ADD CONSTRAINT "chk_case_evidences_fail_reason_outcome"
  CHECK ("fail_reason" IS NULL OR "outcome" = 'closed_fail');

-- draft เก็บค่าที่เลือกค้างไว้ (ไม่บังคับครบ — `41` §6.5)
ALTER TABLE "close_case_drafts"
  ADD COLUMN "fail_reason" TEXT,
  ADD COLUMN "fail_reason_detail" TEXT;

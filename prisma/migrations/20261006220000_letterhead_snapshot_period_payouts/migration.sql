-- มติ PO 06/10/2569 U110/U111 — snapshot หัวกระดาษครบทุกช่อง
--
-- ① organizations.logo_sha256 — SHA-256 ของไฟล์โลโก้ปัจจุบัน (เขียนพร้อม logo_url ตอนอัปโหลด)
--    ใบกำกับภาษี/ใบเสร็จ + ใบแจ้งหนี้ snapshot ค่านี้ลง `seller_profile_snapshot.logo_sha256` ตอนออก
--    พิมพ์ซ้ำ: ไฟล์ที่ path เดิมไม่ตรง hash ⇒ พิมพ์โดยไม่มีโลโก้ (ไม่พิมพ์รูปอื่นแทน)
--    โลโก้ที่อัปโหลดก่อน U110 = NULL (ไม่มี hash ให้ตรวจ — อัปโหลดใหม่เพื่อเริ่มบันทึก)
-- ② handover_lots.letterhead_snapshot — หัวกระดาษองค์กรทั้งชุด ณ ตอนยืนยันล็อต (U111)
--    เขียนใน $transaction ของการยืนยันล็อต (UPDATE ของแถวที่ยังไม่ confirmed ⇒ trigger immutable ไม่ขวาง)
--    ล็อตที่ยืนยันก่อน U111 = NULL ⇒ ใบส่งมอบใช้ค่าปัจจุบัน (มติ PO) · ไม่ backfill (trigger ห้ามแก้ล็อต confirmed)

ALTER TABLE "organizations" ADD COLUMN "logo_sha256" VARCHAR(64);
ALTER TABLE "organizations"
  ADD CONSTRAINT "chk_organizations_logo_sha256"
  CHECK ("logo_sha256" IS NULL OR "logo_sha256" ~ '^[0-9a-f]{64}$');

ALTER TABLE "handover_lots" ADD COLUMN "letterhead_snapshot" JSONB;
-- snapshot มีได้เฉพาะล็อตที่ยืนยันแล้ว และต้องเป็น object
ALTER TABLE "handover_lots"
  ADD CONSTRAINT "chk_handover_lots_letterhead_snapshot"
  CHECK (
    "letterhead_snapshot" IS NULL
    OR ("status" = 'confirmed' AND jsonb_typeof("letterhead_snapshot") = 'object')
  );

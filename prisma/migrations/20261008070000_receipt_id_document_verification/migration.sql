-- มติ PO U143 / U150 (07/10/2569) — ใบเสร็จของเบิกด้วยมือ/เคลียร์เงินทดรอง + เอกสารยืนยันตัวตนผู้รับเงิน
-- เลิกช่อง path/URL พิมพ์เอง → อัปโหลดจริงผ่านกลไกอัปโหลดของ server (ตรวจไฟล์ + SHA-256)
--
-- ข้อมูลเก่าที่เป็น path/URL พิมพ์เอง **ไม่ลบ** — ทำเครื่องหมาย "ไม่ผ่านการตรวจ" (`*_unverified = true`)
-- ระบบถือว่าไม่มีไฟล์ (Export Pack / ความครบของเอกสาร / เกตยืนยันผู้รับเงิน) จนกว่าจะแนบไฟล์ใหม่ที่ตรวจแล้ว
--
-- CHECK: มี path ⇒ ต้องมี hash ที่ server คำนวณ หรือเป็นข้อมูลเก่าที่ทำเครื่องหมายไว้แล้วเท่านั้น
-- (กันโค้ดเส้นใหม่เขียน path ที่ไม่ผ่านการตรวจลงไปเงียบ ๆ)

-- ── expenses: ใบเสร็จ ───────────────────────────────────────────────────────
ALTER TABLE "expenses" ADD COLUMN "receipt_file_unverified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "expenses"
SET "receipt_file_unverified" = true
WHERE "receipt_file_url" IS NOT NULL AND "receipt_file_hash" IS NULL;

ALTER TABLE "expenses" ADD CONSTRAINT "chk_expenses_receipt_verified"
  CHECK ("receipt_file_url" IS NULL OR "receipt_file_hash" IS NOT NULL OR "receipt_file_unverified");

-- ── payee_profiles: เอกสารยืนยันตัวตน ───────────────────────────────────────
ALTER TABLE "payee_profiles" ADD COLUMN "id_document_hash" VARCHAR(64);
ALTER TABLE "payee_profiles" ADD COLUMN "id_document_unverified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "payee_profiles"
SET "id_document_unverified" = true
WHERE "id_document_url" IS NOT NULL;

ALTER TABLE "payee_profiles" ADD CONSTRAINT "chk_payee_profiles_id_document_verified"
  CHECK ("id_document_url" IS NULL OR "id_document_hash" IS NOT NULL OR "id_document_unverified");

-- มติผู้ใช้ 12/10/2569 B3-02 — ลบเคสร่าง (soft delete) แล้วเลขที่สัญญาเดิมต้องสร้างใหม่ได้ (`02` v4.73 · `38` v3.20)
--
-- เดิมทั้งสองตัวเป็น full unique (migration `20260814092000_case_ref_unique_not_partial`) เพราะยังไม่มีทางลบเคส
-- ⇒ เคสที่ soft delete จองเลขไว้ตลอด · ตอนนี้มีการลบเคสร่างแล้ว จึงเปลี่ยน**ทั้งคู่**เป็น partial พร้อมกัน
-- (กติกาสองตัวบนคอลัมน์ทับซ้อนต้องมีความหมายเดียวกัน — REUSE_INDEX 2026-08-14)
--
-- ปลอดภัยต่อข้อมูลเดิม: index ใหม่หลวมกว่าเดิม (แถวที่ผ่าน full unique ย่อมผ่าน partial) · ไม่มีแถวถูกแก้
-- · recycle เพิ่ม tracking_round บนแถวเดิม (ไม่สร้างแถวใหม่) ⇒ เลขเดียวกันมีแถว active ได้ทีละแถวเหมือนเดิม
-- · เคสที่ลบได้มีแต่ `draft` (ไม่มีรายได้/ทรัพย์/การมอบหมายผูก) — ไม่มีข้อมูลปลายทางอ้างเลขซ้ำ
DROP INDEX IF EXISTS "cases_organization_id_company_id_case_ref_tracking_round_key";
CREATE UNIQUE INDEX "cases_organization_id_company_id_case_ref_tracking_round_key"
  ON "cases"("organization_id", "company_id", "case_ref", "tracking_round") WHERE "deleted_at" IS NULL;

DROP INDEX IF EXISTS "uniq_cases_company_case_ref";
CREATE UNIQUE INDEX "uniq_cases_company_case_ref"
  ON "cases"("organization_id", "company_id", "case_ref_normalized") WHERE "deleted_at" IS NULL;

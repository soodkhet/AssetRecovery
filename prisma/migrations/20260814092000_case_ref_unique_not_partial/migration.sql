-- Phase 2.2 (แก้ต่อจาก `20260814090450_case_submission_fields`)
--
-- index เดิมถูกสร้างเป็น partial (`WHERE deleted_at IS NULL`) ตามแบบ `uniq_assets_active_imei` แต่
-- `cases` มี UNIQUE(organization_id, company_id, case_ref, tracking_round) จาก `02` §6 อยู่แล้ว ซึ่ง
-- **ไม่ partial** ⇒ เคสที่ถูก soft delete ยังจองเลขที่สัญญาไว้อยู่ดี การทำ partial จึงให้ภาพลวงว่า
-- ปล่อยเลขคืนได้ทั้งที่จริงไม่ได้ · `38` §11 ไม่ได้ระบุให้ปล่อยเลขคืนหลังลบ ⇒ ให้กติกาทั้งสองตรงกัน
DROP INDEX IF EXISTS "uniq_cases_company_case_ref";

CREATE UNIQUE INDEX "uniq_cases_company_case_ref" ON "cases"("organization_id", "company_id", "case_ref_normalized");

-- Phase 8.2 — Index profiling ของ query ที่ join หนัก (แดชบอร์ด + รายงาน F/O/A/E)
--
-- ปิด Open Item ของ `02` §15 ("Index profiling เต็มรูปแบบสำหรับ dashboard query ที่ join หลาย table")
-- บางส่วน — สำรวจจาก `lib/reports/**` ทุก provider แล้วเทียบกับ `@@index` ที่มีจริง
--
-- ### ช่องว่างที่พบ (ทุกตัวคือ pattern `organization_id + <คอลัมน์วันที่/สถานะ>` ที่ไม่มี index รองรับ)
-- provider ของรายงานกรองด้วย "ช่วงวันที่" เป็นหลัก แต่ index เดิมเป็น `(org, status)` ล้วน
-- ⇒ query ที่ไม่ได้กรอง status (F1/F2/E1/E2/E3/A2) ใช้ index เดิมไม่ได้เลย ต้องอ่านทั้ง org ทุกครั้ง
-- และ `exceptions` / `case_assignments` / `payout_batch_items` ไม่มี index ที่ขึ้นต้นด้วย
-- `organization_id` แม้แต่ตัวเดียว (ผิดกติกา Rule 02 ด้วย)
--
-- ### กติกาที่ยึด (Rule 02)
-- composite index ขึ้นต้น `organization_id` เสมอ · ชื่อ `idx_<table>_<cols>` · เพิ่มผ่าน migration เท่านั้น
--
-- ### index เดิมที่ถูกแทน (ไม่ใช่การลบทิ้งเปล่า ๆ — ตัวใหม่คลุม prefix เดิมครบ)
-- Postgres ใช้ composite index ตอบ query ที่กรองด้วย **คอลัมน์นำหน้า** ได้อยู่แล้ว ⇒ ตัวเดิมที่กลายเป็น
-- prefix ของตัวใหม่มีแต่ค่า write ไม่มีประโยชน์เพิ่ม:
--   `idx_cases_org_status`   ⊂ `idx_cases_org_status_closed_at`
--   `idx_expenses_org_status`⊂ `idx_expenses_org_status_date`
--   `idx_cases_org_company`  ⊂ unique `(organization_id, company_id, case_ref, tracking_round)`
--   `idx_pbi_batch`          ⊂ unique `(payout_batch_id, expense_id)`

-- ── cases ────────────────────────────────────────────────────────────────────
-- O1 (อัตราสำเร็จ) · E1 (KPI ผู้บริหาร — เปิดหน้าเดียวยิง 12 เดือน) · E2/E3 กรองด้วย `created_at`
-- ซึ่งเดิมไม่มี index ตัวไหนคลุมเลย
CREATE INDEX IF NOT EXISTS idx_cases_org_created_at ON cases (organization_id, created_at);

-- O2 (ผลงานทีม) · E3 (Scorecard ทีม) กรอง `status IN (closed_success, closed_fail)` + ช่วง `closed_at`
-- `idx_cases_closed` เดิมใช้ `outcome` เป็นคอลัมน์ที่สอง ⇒ ตอบ query ที่กรอง `status` ไม่ได้
CREATE INDEX IF NOT EXISTS idx_cases_org_status_closed_at ON cases (organization_id, status, closed_at);
DROP INDEX IF EXISTS idx_cases_org_status;
DROP INDEX IF EXISTS idx_cases_org_company;

-- ── expenses ─────────────────────────────────────────────────────────────────
-- `loadProfitEntries()` (ใช้ร่วมกัน F1 · E1 · E2 · E3 · แท็บกำไรของไฟล์ 21) กรอง
-- `status = 'approved'` + ช่วง `expense_date` — เป็น query ที่ถูกยิงถี่ที่สุดในระบบรายงาน
CREATE INDEX IF NOT EXISTS idx_expenses_org_status_date ON expenses (organization_id, status, expense_date);
DROP INDEX IF EXISTS idx_expenses_org_status;

-- ── revenues ─────────────────────────────────────────────────────────────────
-- `loadProfitEntries()` ฝั่งรายได้ + F2 (สรุปรายได้) กรองด้วยช่วง `revenue_date` **โดยไม่กรอง status**
-- ⇒ `idx_revenues_org_status` เดิมใช้ไม่ได้
CREATE INDEX IF NOT EXISTS idx_revenues_org_revenue_date ON revenues (organization_id, revenue_date);

-- ── exceptions ───────────────────────────────────────────────────────────────
-- แดชบอร์ดการเงินนับ exception ที่ `open` ทุกครั้งที่โหลดหน้า + หน้ารายการเรียงตาม `created_at DESC`
-- ตารางนี้เดิมมี index เดียวที่ขึ้นต้นด้วย `period_id` (ไม่มี `organization_id` เลย)
CREATE INDEX IF NOT EXISTS idx_exceptions_org_status_created ON exceptions (organization_id, status, created_at);

-- ── case_assignments ─────────────────────────────────────────────────────────
-- O3 (ภาระงาน) กรองช่วง `created_at` ระดับองค์กร — เดิมไม่มี index ที่ขึ้นต้นด้วย `organization_id`
CREATE INDEX IF NOT EXISTS idx_assignments_org_created ON case_assignments (organization_id, created_at);

-- ── tax_invoices ─────────────────────────────────────────────────────────────
-- A2 (ใบกำกับภาษี) กรองช่วง `invoice_date` โดยไม่กรอง status
CREATE INDEX IF NOT EXISTS idx_tax_invoices_org_invoice_date ON tax_invoices (organization_id, invoice_date);

-- ── payout_batch_items ───────────────────────────────────────────────────────
-- F4 (ค่าตอบแทน) เริ่มจาก `organization_id` + `expense_id IS NOT NULL` แล้ว join กลับ `expenses`
-- ตารางนี้เดิมไม่มี index ที่ขึ้นต้นด้วย `organization_id` เลย
CREATE INDEX IF NOT EXISTS idx_pbi_org_expense ON payout_batch_items (organization_id, expense_id);
DROP INDEX IF EXISTS idx_pbi_batch;

-- 1 เคส : 1 พนักงานที่ยังถือเคสอยู่ (กติกา "1 เคส : 1 พนักงานเท่านั้น" ของโมดูลมอบหมายงาน) — UAT BUG-038 · มติ PO U64
-- สถานะที่ "ยังถือเคส" = pending_accept / accepted_unscheduled / scheduled / needs_revision
-- (ชุดเดียวกับ ACTIVE_ASSIGNMENT_STATUSES ใน lib/assignments/assignment.ts) — ปิดแล้ว/ถูกโอนออกไม่นับ
-- ตัวบังคับจริงของ ASSIGNMENT_ALREADY_EXISTS ภายใต้ concurrency (เช็คในแอปอย่างเดียวแข่งกันได้ 2 แถว)
-- ทุกจุดที่เปิดแถวใหม่ (reassign ทันที / ยินยอม / timeout) ปิดแถวเดิมก่อนสร้างใน transaction เดียวกันอยู่แล้ว
CREATE UNIQUE INDEX "uniq_case_assignment_active"
  ON "case_assignments" ("case_id")
  WHERE "status" IN ('pending_accept', 'accepted_unscheduled', 'scheduled', 'needs_revision');

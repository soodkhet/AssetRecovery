-- Phase 2.9 — Field Tracker ชุด 2 (`41` §6.4.2 / §6.6 / §10.1 / §15)
-- sync เข้า `02` §6 (v4.3) ตามมติ PO 14/08/2569 — เขียนด้วยมือทั้งใบ
-- (`migrate dev` แถม SQL พยศ ดู REUSE_INDEX กับดัก 14/08/2569)

-- ── 1) expenses — ช่องที่ `41` §6.6 บังคับแต่ `02` v4.2 ยังไม่มี ────────────
-- `expense_date`: ทั้ง 2 กลุ่มของ §6.6 มีช่อง `date` (ผูกเคส = วันปิดงาน · เบิกแยก = วันเข้าพัก)
--   ตารางยังว่างทั้งใบ (โมดูลการเงินเริ่มจริง Phase 3) จึงเพิ่มเป็น NOT NULL ได้โดยไม่ต้องมี DEFAULT
--   — ตั้งใจไม่ให้มี DEFAULT เพื่อบังคับให้ทุกจุดที่สร้าง expense ระบุวันที่เชิงธุรกิจเอง
ALTER TABLE "expenses" ADD COLUMN "expense_date" DATE NOT NULL;

-- `distance_km`: ระยะทางจริงของ fuel PER_KM (`41` §6.4.2) — **ไม่ใช่เงิน** (เงินยังเป็น satang INTEGER)
ALTER TABLE "expenses" ADD COLUMN "distance_km" NUMERIC(10,2);

-- เบิกที่พัก (`41` §6.6 กลุ่ม "เบิกแยก") — ผู้พักร่วมต้องเป็นคนในทีมเดียวกัน (ยามอยู่ฝั่ง service)
ALTER TABLE "expenses" ADD COLUMN "shared_with_user_id" UUID REFERENCES users(id);
ALTER TABLE "expenses" ADD COLUMN "receipt_file_url" TEXT;

-- สายตีกลับหลักฐาน (`41` §10.1) — รายการรอบเดิม `superseded` ชี้ไปยังรายการใหม่ที่มาแทน
ALTER TABLE "expenses" ADD COLUMN "superseded_by_expense_id" UUID REFERENCES expenses(id);

-- รายการเบิก/สรุปรายได้ของพนักงานกรองตามเดือนเสมอ (`41` §7.9/§7.10)
CREATE INDEX idx_expenses_payee_date ON expenses(payee_id, expense_date);

-- fuel/allowance ของ 1 รอบติดตาม ต้องมีได้ชนิดละ 1 รายการที่ยัง "มีผล" เท่านั้น
-- (`41` §10.1 — resubmit สร้างรายการใหม่ได้เฉพาะเมื่อรายการเดิมถูก mark `superseded` แล้ว)
-- กันรายการเบิกซ้ำจากการกด submit/resubmit ซ้อนกัน (idempotency ระดับ DB)
CREATE UNIQUE INDEX uniq_active_case_expense_per_assignment
  ON expenses(assignment_id, expense_type)
  WHERE assignment_id IS NOT NULL AND status <> 'superseded' AND deleted_at IS NULL;

-- ── 2) push_subscriptions — Web Push ของ PWA ภาคสนาม (`41` §15) ────────────
CREATE TABLE push_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id),
  user_id         UUID        NOT NULL REFERENCES users(id),
  endpoint        TEXT        NOT NULL UNIQUE,
  p256dh          TEXT        NOT NULL,
  auth            TEXT        NOT NULL,
  user_agent      TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failure_count   INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        NOT NULL REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID        REFERENCES users(id),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(organization_id, user_id, deleted_at);

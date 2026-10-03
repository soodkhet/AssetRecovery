-- มติ PO 03/10/2569 (UAT Q21 · `02` v4.12 · DEC-012): ค่าน้ำมันเหมาจ่าย (DAILY_FLAT) + เบี้ยเลี้ยง
-- = วันละ 1 ครั้งต่อพนักงานต่อวันปฏิทินไทย แล้วกระจายเฉลี่ยทุกเคสที่เช็คอินวันนั้น · สร้างโดย job
-- `daily_field_allowance` หลังจบวัน

-- 1 แถว = (พนักงาน, วัน) ที่ settle แล้ว — UNIQUE คือยามกันซ้ำระดับ DB ของ job (รันซ้ำ/รันพร้อมกัน)
-- insert-only: ไม่มี updated_* / deleted_at (`02` §2.4 กลุ่มตารางบันทึกเหตุการณ์)
CREATE TABLE "field_day_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "field_date" DATE NOT NULL,
    "comp_plan_id" UUID,
    "comp_plan_version" INTEGER,
    "fuel_total_satang" INTEGER NOT NULL,
    "allowance_total_satang" INTEGER NOT NULL,
    "case_count" INTEGER NOT NULL,
    "job_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "field_day_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_field_day_settlements_non_negative"
      CHECK ("fuel_total_satang" >= 0 AND "allowance_total_satang" >= 0 AND "case_count" >= 0)
);

CREATE UNIQUE INDEX "uniq_field_day_settlements_org_agent_date"
  ON "field_day_settlements"("organization_id", "agent_id", "field_date");
CREATE INDEX "idx_field_day_settlements_org_date"
  ON "field_day_settlements"("organization_id", "field_date");

ALTER TABLE "field_day_settlements" ADD CONSTRAINT "field_day_settlements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "field_day_settlements" ADD CONSTRAINT "field_day_settlements_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "field_day_settlements" ADD CONSTRAINT "field_day_settlements_comp_plan_id_fkey"
  FOREIGN KEY ("comp_plan_id") REFERENCES "compensation_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- แถว expenses ที่เกิดจากการ settle รายวัน
ALTER TABLE "expenses" ADD COLUMN "field_day_settlement_id" UUID;
CREATE INDEX "idx_expenses_field_day_settlement" ON "expenses"("field_day_settlement_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_field_day_settlement_id_fkey"
  FOREIGN KEY ("field_day_settlement_id") REFERENCES "field_day_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- แถวรายวันของเคสที่ลงพื้นที่หลายวัน = allowance/fuel หลายแถวต่อรอบติดตาม ⇒ ยกเว้นจากกติกา
-- "ชนิดละ 1 รายการที่ยังมีผลต่อรอบ" (`41` §10.1 — ใช้กับรายการตอนปิดงานเท่านั้น)
DROP INDEX IF EXISTS "uniq_active_case_expense_per_assignment";
CREATE UNIQUE INDEX "uniq_active_case_expense_per_assignment"
  ON "expenses"("assignment_id", "expense_type")
  WHERE "assignment_id" IS NOT NULL AND "status" <> 'superseded' AND "deleted_at" IS NULL
    AND "field_day_settlement_id" IS NULL;

-- แถวรายวัน: 1 การ settle × 1 เคส × 1 ชนิด = 1 แถว (ยามชั้น DB คู่กับ UNIQUE ของ settlement)
CREATE UNIQUE INDEX "uniq_expenses_field_day_case_type"
  ON "expenses"("field_day_settlement_id", "case_id", "expense_type")
  WHERE "field_day_settlement_id" IS NOT NULL AND "deleted_at" IS NULL;

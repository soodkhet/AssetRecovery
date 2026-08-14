-- Phase 2.6 — ตารางของไฟล์ 40 (Case Assignment & Routing)
-- ⚠️ ตัดบล็อกพยศที่ `migrate dev` แถมมาออกแล้ว (DROP INDEX uniq_cases_company_case_ref,
--    ALTER ... updated_at DROP DEFAULT ของทุกตาราง, advances.return_satang SET NOT NULL)
--    ตามกับดักที่บันทึกไว้ใน docs/REUSE_INDEX.md (2026-08-14)

-- CreateEnum
CREATE TYPE "pending_reassignment_status" AS ENUM ('waiting_consent', 'consented', 'declined', 'timeout_auto');

-- CreateEnum
CREATE TYPE "reassignment_resolution" AS ENUM ('consented', 'timeout_auto');

-- CreateTable
CREATE TABLE "pending_reassignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "from_agent_id" UUID NOT NULL,
    "new_agent_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "pending_reassignment_status" NOT NULL DEFAULT 'waiting_consent',
    "decline_reason" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "pending_reassignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reassignment_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "pending_reassignment_id" UUID,
    "from_agent_id" UUID NOT NULL,
    "to_agent_id" UUID NOT NULL,
    "reassigned_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6) NOT NULL,
    "resolution" "reassignment_resolution" NOT NULL,
    "reason" TEXT NOT NULL,
    "was_accepted_before_reassign" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "reassignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_policy_settings" (
    "organization_id" UUID NOT NULL,
    "reassign_timeout_hours" INTEGER NOT NULL DEFAULT 3,
    "supervisor_can_assign_system" BOOLEAN NOT NULL DEFAULT true,
    "supervisor_can_assign_inhouse" BOOLEAN NOT NULL DEFAULT true,
    "supervisor_can_assign_outsource" BOOLEAN NOT NULL DEFAULT true,
    "accept_deadline_hours" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "assignment_policy_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE INDEX "idx_pending_reassignments_case" ON "pending_reassignments"("case_id", "status");

-- CreateIndex
CREATE INDEX "idx_pending_reassignments_due" ON "pending_reassignments"("status", "expires_at");

-- CreateIndex
CREATE INDEX "idx_reassignment_history_case" ON "reassignment_history"("organization_id", "case_id");

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_from_agent_id_fkey" FOREIGN KEY ("from_agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_new_agent_id_fkey" FOREIGN KEY ("new_agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_reassignments" ADD CONSTRAINT "pending_reassignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reassignment_history" ADD CONSTRAINT "reassignment_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reassignment_history" ADD CONSTRAINT "reassignment_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reassignment_history" ADD CONSTRAINT "reassignment_history_pending_reassignment_id_fkey" FOREIGN KEY ("pending_reassignment_id") REFERENCES "pending_reassignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reassignment_history" ADD CONSTRAINT "reassignment_history_from_agent_id_fkey" FOREIGN KEY ("from_agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reassignment_history" ADD CONSTRAINT "reassignment_history_to_agent_id_fkey" FOREIGN KEY ("to_agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reassignment_history" ADD CONSTRAINT "reassignment_history_reassigned_by_fkey" FOREIGN KEY ("reassigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_policy_settings" ADD CONSTRAINT "assignment_policy_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_policy_settings" ADD CONSTRAINT "assignment_policy_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── กติกาที่ Prisma ไม่รองรับ ────────────────────────────────────────────────
-- 1 เคสมีคำขอเปลี่ยนผู้รับผิดชอบที่ยังรอผลได้ครั้งละ 1 คำขอ (`40` §12 REASSIGNMENT_ALREADY_PENDING)
CREATE UNIQUE INDEX "uniq_pending_reassignment_active"
  ON "pending_reassignments" ("case_id")
  WHERE "status" = 'waiting_consent';

-- `@updatedAt` ของ Prisma ไม่ออก DB default (กับดัก 2026-08-14) — ตารางใหม่ต้องเติมเอง
ALTER TABLE "pending_reassignments" ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE "assignment_policy_settings" ALTER COLUMN updated_at SET DEFAULT NOW();

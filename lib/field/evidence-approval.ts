import { emitAudit } from '@/lib/audit/audit'
import type { CaseOutcome } from '@/lib/generated/prisma/enums'
import type { WarehouseTxClient } from '@/lib/warehouse/asset-hook'

/**
 * หลักฐานปิดงาน **ผ่านอัตโนมัติเมื่อเคสไปต่อ** (มติ PO 03/10/2569 — UAT Q14 · BUG-055 · `41` §10.1)
 *
 * ระบบไม่มีขั้น "อนุมัติหลักฐาน" แยก — `case_evidences.status` (`evidence_status`: pending/approved/rejected
 * ตาม `02` §3 ไม่สร้างค่าใหม่) เปลี่ยนตามเหตุการณ์ปลายน้ำ:
 * - `closed_success` → `approved` เมื่อ **คลังรับเครื่องเข้า** (`intake` สำเร็จ — `44` §8.2)
 * - `closed_fail`    → `approved` เมื่อ **ค่าตอบแทนของเคสถูกอนุมัติครบขั้น** (`expense.approved` — `16`)
 *
 * หลังผ่านแล้ว**ตีกลับไม่ได้** (`EVIDENCE_REJECT_AFTER_FINAL`) และแถวแก้ไม่ได้ระดับ DB
 * (trigger `trg_case_evidences_approved_no_update` — `02` §13)
 *
 * ⚠️ ต้องเรียก**ใน `$transaction` เดียวกับเหตุการณ์ต้นทาง** (ส่ง tx เข้ามา) — idempotent: ชุดที่ผ่านไปแล้ว/
 *    ถูกตีกลับอยู่ ไม่แตะ (ชุดที่ถูกตีกลับรอพนักงานส่งใหม่ — ชุดใหม่จะเป็น pending แล้วผ่านตามรอบถัดไป)
 */

export type EvidenceAutoApproveTrigger = 'asset_intake' | 'expense_approved'

/** outcome ที่เหตุการณ์แต่ละตัวทำให้หลักฐานผ่าน — ห้ามสลับ (เคสไม่สำเร็จไม่ผ่านคลัง — `19` §6.1) */
export const EVIDENCE_AUTO_APPROVE_OUTCOME: Readonly<Record<EvidenceAutoApproveTrigger, CaseOutcome>> = {
  asset_intake: 'closed_success',
  expense_approved: 'closed_fail',
}

const AUTO_APPROVE_REASON: Readonly<Record<EvidenceAutoApproveTrigger, string>> = {
  asset_intake: 'หลักฐานปิดงานผ่านอัตโนมัติ — คลังรับเครื่องเข้าแล้ว',
  expense_approved: 'หลักฐานปิดงานผ่านอัตโนมัติ — ค่าตอบแทนของเคสได้รับอนุมัติแล้ว',
}

export async function autoApproveCaseEvidence(
  tx: WarehouseTxClient,
  input: {
    organizationId: string
    caseId: string
    trigger: EvidenceAutoApproveTrigger
    actorId: string
    actorRole: string
  },
): Promise<string | null> {
  const outcome = EVIDENCE_AUTO_APPROVE_OUTCOME[input.trigger]
  const latest = await tx.caseEvidence.findFirst({
    where: { organizationId: input.organizationId, caseId: input.caseId },
    orderBy: { submittedAt: 'desc' },
    select: { id: true, status: true, outcome: true },
  })
  if (latest === null || latest.status !== 'pending' || latest.outcome !== outcome) return null

  const reviewedAt = new Date()
  const claimed = await tx.caseEvidence.updateMany({
    where: { id: latest.id, status: 'pending' },
    data: { status: 'approved', reviewedBy: input.actorId, reviewedAt, updatedBy: input.actorId },
  })
  if (claimed.count === 0) return null

  await emitAudit(
    {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: 'approve',
      targetType: 'case_evidences',
      targetId: latest.id,
      before: { status: 'pending' },
      after: { status: 'approved', caseId: input.caseId, trigger: input.trigger, auto: true, reviewedAt },
      reason: AUTO_APPROVE_REASON[input.trigger],
      diffOnly: false,
    },
    tx,
  )
  return latest.id
}

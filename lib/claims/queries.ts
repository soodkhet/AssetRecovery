import { emitAudit } from '@/lib/audit/audit'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  MANUAL_CLAIM_CALCULATION_SOURCE,
  MANUAL_CLAIM_INITIAL_STATUS,
} from '@/lib/claims/claim'
import type { ClaimCreateInput } from '@/lib/claims/schemas'
import { AuthError } from '@/lib/auth/errors'
import { ensureAgentPayeeId, type ExpenseTxClient } from '@/lib/field/expense-queries'
import { ExpenseStateError } from '@/lib/field/expense-status'
import { prisma } from '@/lib/prisma'

/**
 * Manual Claim — ชั้น DB (`15` §6.1/§14 · `27` §6.4)
 *
 * **ไม่มี list/approve/reject ของตัวเอง**: รายการเบิกทุกแหล่งเป็น entity เดียวกัน (`15` §9 header)
 * ⇒ `GET /api/claims` และ `PATCH /api/claims/:id/approve|reject` เรียกใช้ชั้นข้อมูลของไฟล์ 16
 * (`lib/compensation/approval-queries.ts`) ตัวเดิม **ห้ามเขียนสายอนุมัติซ้ำ**
 */

export { CREATE_CLAIM_CAPABILITIES } from '@/lib/claims/claim'

export interface ClaimMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

/** ผู้ถือสิทธิ์อนุมัติขั้นการเงินเท่านั้นที่บันทึกแทนผู้อื่นได้ (`25` §7.2) */
function canCreateForOthers(user: SessionUser): boolean {
  return user.isSuperadmin || hasCapability(user, 'manage', 'approve_expense_finance')
}

export interface ManualClaimResult {
  id: string
  payeeId: string
}

/**
 * สร้างรายการเบิกด้วยมือ — เข้าคิวอนุมัติสายเดียวกับรายการอัตโนมัติทันที (`15` §6.1)
 * ยอด/ประเภท/วันที่มาจากผู้กรอกล้วน ๆ (`calculation_source = 'manual'`) ไม่มีสูตรของ `22` เข้ามาเกี่ยว
 */
export async function createManualClaim(
  context: ClaimMutationContext,
  input: ClaimCreateInput,
): Promise<ManualClaimResult> {
  const user = context.actor
  if (input.payeeId !== null && !canCreateForOthers(user)) {
    throw new AuthError('PERMISSION_DENIED', 'บันทึกรายการเบิกแทนผู้อื่นต้องมีสิทธิ์อนุมัติขั้นการเงิน')
  }

  return prisma.$transaction(async (tx) => {
    const payeeId =
      input.payeeId === null
        ? await ensureAgentPayeeId(tx as ExpenseTxClient, {
            organizationId: user.organizationId,
            userId: user.id,
            actorId: user.id,
          })
        : await assertPayeeInOrganization(tx as ExpenseTxClient, user.organizationId, input.payeeId)

    const row = await tx.expense.create({
      data: {
        organizationId: user.organizationId,
        // `02` §8 — Manual Claim ไม่ผูกเคส (ไม่กระทบเกต Revenue ของเคส)
        caseId: null,
        assignmentId: null,
        payeeId,
        expenseType: input.claimType,
        grossSatang: input.grossSatang,
        expenseDate: input.expenseDate,
        calculationSource: MANUAL_CLAIM_CALCULATION_SOURCE,
        status: MANUAL_CLAIM_INITIAL_STATUS,
        receiptFileUrl: input.receiptFileUrl,
        revisionNote: input.note,
        createdBy: user.id,
      },
      select: { id: true, payeeId: true },
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'create',
        targetType: 'expenses',
        targetId: row.id,
        after: {
          payee_id: payeeId,
          expense_type: input.claimType,
          gross_satang: input.grossSatang,
          expense_date: input.expenseDate.toISOString().slice(0, 10),
          calculation_source: MANUAL_CLAIM_CALCULATION_SOURCE,
          status: MANUAL_CLAIM_INITIAL_STATUS,
        },
        reason: input.note,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return { id: row.id, payeeId: row.payeeId }
  })
}

async function assertPayeeInOrganization(
  tx: ExpenseTxClient,
  organizationId: string,
  payeeId: string,
): Promise<string> {
  const payee = await tx.payeeProfile.findFirst({
    where: { id: payeeId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (payee === null) throw new ExpenseStateError('EXPENSE_NOT_FOUND', { detail: `payee=${payeeId}` })
  return payee.id
}

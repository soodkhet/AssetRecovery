import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  MANUAL_CLAIM_CALCULATION_SOURCE,
  MANUAL_CLAIM_INITIAL_STATUS,
} from '@/lib/claims/claim'
import { assertNoDuplicateClaimSubmission } from '@/lib/claims/duplicate-submission-queries'
import type { ClaimCreateInput } from '@/lib/claims/schemas'
import { AuthError } from '@/lib/auth/errors'
import { ensureAgentPayeeId, type ExpenseTxClient } from '@/lib/field/expense-queries'
import { ExpenseStateError } from '@/lib/field/expense-status'
import { FieldError } from '@/lib/field/errors'
import { notifyExpensesAwaitingApproval } from '@/lib/notifications/approval-queue'
import { prisma } from '@/lib/prisma'
import { issueSubstituteReceipt } from '@/lib/substitute-receipts/queries'
import { expenseReceiptRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

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

/** ผู้ถือสิทธิ์อนุมัติขั้นการเงินเท่านั้นที่บันทึกแทนผู้อื่นได้ (`25` §7.2 · มติ PO U153) — หน้าจอใช้ซ่อนช่องเลือกผู้รับ */
export function canCreateClaimForOthers(user: SessionUser): boolean {
  return user.isSuperadmin || hasCapability(user, 'manage', 'approve_expense_finance')
}

export interface ManualClaimResult {
  id: string
  payeeId: string
  /** มติ PO U143 — เลขใบรับรองแทนใบเสร็จที่ออกให้ (ไม่มีใบเสร็จ) · มีใบเสร็จ = `null` */
  substituteReceiptNumber: string | null
}

/** ฟอร์ม/ผู้เรียกฝั่ง server ที่ไม่ได้ผ่าน schema ไม่ต้องส่ง `substituteReceipt` (= มีใบเสร็จ) */
export type ManualClaimCreateInput = Omit<ClaimCreateInput, 'substituteReceipt'> & {
  substituteReceipt?: ClaimCreateInput['substituteReceipt']
}

/**
 * สร้างรายการเบิกด้วยมือ — เข้าคิวอนุมัติสายเดียวกับรายการอัตโนมัติทันที (`15` §6.1)
 * ยอด/ประเภท/วันที่มาจากผู้กรอกล้วน ๆ (`calculation_source = 'manual'`) ไม่มีสูตรของ `22` เข้ามาเกี่ยว
 */
export async function createManualClaim(
  context: ClaimMutationContext,
  input: ManualClaimCreateInput,
): Promise<ManualClaimResult> {
  const user = context.actor
  if (input.payeeId !== null && !canCreateClaimForOthers(user)) {
    throw new AuthError('PERMISSION_DENIED', 'บันทึกรายการเบิกแทนผู้อื่นต้องมีสิทธิ์อนุมัติขั้นการเงิน')
  }

  // Period Lock (`13` §6.11 · Phase 4.1) — เบิกย้อนหลังเข้างวดที่ปิดแล้วไม่ได้ ต้องผ่าน Adjustment
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: input.expenseDate,
    targetType: 'expenses',
  })

  // มติ PO U143 — ใบเสร็จต้องเป็นไฟล์ที่อัปโหลดผ่าน server แล้ว: ดาวน์โหลดมาตรวจเอง (prefix ของผู้บันทึก · มีจริง ·
  // magic bytes รูป/PDF · ขนาด) + SHA-256 ของ server · นอก `$transaction` (I/O เครือข่าย)
  // ไม่มีใบเสร็จ ⇒ ออกใบรับรองแทนใบเสร็จในทรานแซกชันเดียวกัน (กติกาเดิม U103) — ฉบับเซ็นอัปโหลดภายหลัง
  const substituteLines = input.substituteReceipt?.lines ?? null
  if (input.receiptFileUrl === null && substituteLines === null) {
    throw new FieldError('REQUIRED_MISSING', {
      message: 'ต้องแนบใบเสร็จ หรือติ๊ก "ไม่มีใบเสร็จ" แล้วกรอกรายการ',
      detail: 'manual claim without receipt or substitute receipt',
      context: { fields: ['receiptFileUrl'] },
    })
  }
  const receipt =
    input.receiptFileUrl === null ? null : await verifyUploadedFile(input.receiptFileUrl, expenseReceiptRule(user.id))

  const created = await prisma.$transaction(async (tx) => {
    const payeeId =
      input.payeeId === null
        ? await ensureAgentPayeeId(tx as ExpenseTxClient, {
            organizationId: user.organizationId,
            userId: user.id,
            actorId: user.id,
          })
        : await assertPayeeInOrganization(tx as ExpenseTxClient, user.organizationId, input.payeeId)

    // preship PS-003 — retry/ส่งซ้ำของใบเดียวกันไม่สร้างใบเบิกใหม่ (เฉพาะฟอร์มเบิกมือ ไม่ใช่คำขอส่วนเกินอัตโนมัติ)
    await assertNoDuplicateClaimSubmission(tx as ExpenseTxClient, {
      organizationId: user.organizationId,
      payeeId,
      expenseType: input.claimType,
      grossSatang: input.grossSatang,
      expenseDate: input.expenseDate,
      receiptFileHash: receipt?.sha256 ?? null,
      revisionNote: input.note,
      hotelNights: null,
      sharedWithUserId: null,
      receiptInCompanyName: false,
    })

    const claim = await insertManualClaim(tx as ExpenseTxClient, context, {
      payeeId,
      claimType: input.claimType,
      grossSatang: input.grossSatang,
      expenseDate: input.expenseDate,
      receiptFileUrl: input.receiptFileUrl,
      receiptFileHash: receipt?.sha256 ?? null,
      note: input.note,
      compPlanId: null,
      compPlanVersion: null,
    })
    const substitute =
      substituteLines === null
        ? null
        : await issueSubstituteReceipt(tx as ExpenseTxClient, context, {
            organizationId: user.organizationId,
            payeeId,
            link: { kind: 'expense', expenseId: claim.id },
            lines: substituteLines,
            at: new Date(),
          })
    return { ...claim, substituteReceiptNumber: substitute?.receiptNumber ?? null }
  })

  // มติ PO U29 — เข้าคิวอนุมัติทันที ⇒ แจ้งผู้อนุมัติขั้น 1 (หลัง commit)
  notifyExpensesAwaitingApproval(user.organizationId, [created.id])
  return created
}

export interface ManualClaimInsert {
  payeeId: string
  claimType: ClaimCreateInput['claimType']
  grossSatang: number
  expenseDate: Date
  receiptFileUrl: string | null
  /** SHA-256 ที่ server คำนวณจาก `verifyUploadedFile()` — มี path ⇒ ต้องมี hash เสมอ (CHECK ระดับ DB · มติ PO U143) */
  receiptFileHash: string | null
  note: string | null
  /**
   * snapshot แผนค่าตอบแทน (`92` §7.1) — ใช้เป็น **fallback อัตรา WHT** ตอนเข้ารอบจ่ายเมื่อ payee
   * ยังไม่มี Tax Profile (`18` §6.3) · Manual Claim จากฟอร์มส่ง `null` (ไม่มีแผนเกี่ยวข้อง)
   */
  compPlanId: string | null
  compPlanVersion: number | null
}

/**
 * แทรก Manual Claim + audit **ภายในทรานแซกชันของผู้เรียก** — ใช้ร่วมระหว่างฟอร์มเบิก (`createManualClaim`)
 * กับคำขอเบิกส่วนเกินอัตโนมัติตอนเคลียร์ยอดเงินทดรอง (มติ PO 03/10/2569 — UAT Q3) ⇒ แถวหน้าตาเดียวกันเสมอ
 * ผู้เรียกต้องตรวจ Period Lock + ขอบเขต payee มาก่อนแล้ว
 */
export async function insertManualClaim(
  tx: ExpenseTxClient,
  context: ClaimMutationContext,
  input: ManualClaimInsert,
): Promise<Omit<ManualClaimResult, 'substituteReceiptNumber'>> {
  const user = context.actor
  // มติ PO U153 — บันทึกแทนผู้อื่น ⇒ audit ระบุผู้รับ (เจ้าของ payee) แยกจากผู้บันทึก (`actor_id`)
  const payeeOwner = await tx.payeeProfile.findUnique({ where: { id: input.payeeId }, select: { userId: true } })
  const onBehalfOfUserId = payeeOwner !== null && payeeOwner.userId !== user.id ? payeeOwner.userId : null
  const row = await tx.expense.create({
    data: {
      organizationId: user.organizationId,
      // `02` §8 — Manual Claim ไม่ผูกเคส (ไม่กระทบเกต Revenue ของเคส)
      caseId: null,
      assignmentId: null,
      payeeId: input.payeeId,
      expenseType: input.claimType,
      grossSatang: input.grossSatang,
      expenseDate: input.expenseDate,
      calculationSource: MANUAL_CLAIM_CALCULATION_SOURCE,
      compPlanId: input.compPlanId,
      compPlanVersion: input.compPlanVersion,
      status: MANUAL_CLAIM_INITIAL_STATUS,
      receiptFileUrl: input.receiptFileUrl,
      receiptFileHash: input.receiptFileHash,
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
        payee_id: input.payeeId,
        expense_type: input.claimType,
        gross_satang: input.grossSatang,
        expense_date: input.expenseDate.toISOString().slice(0, 10),
        calculation_source: MANUAL_CLAIM_CALCULATION_SOURCE,
        comp_plan_id: input.compPlanId,
        comp_plan_version: input.compPlanVersion,
        status: MANUAL_CLAIM_INITIAL_STATUS,
        receipt_file_url: input.receiptFileUrl,
        receipt_file_hash: input.receiptFileHash,
        recorded_by: user.id,
        on_behalf_of_user_id: onBehalfOfUserId,
      },
      reason: input.note,
      ipAddress: context.meta.ipAddress,
      userAgent: context.meta.userAgent,
      diffOnly: false,
    },
    tx,
  )

  return { id: row.id, payeeId: row.payeeId }
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

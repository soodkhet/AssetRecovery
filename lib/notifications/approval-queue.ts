import { after } from 'next/server'
import { APPROVE_ADVANCE } from '@/lib/advances/advance'
import { approvalRoleContract, approversInCurrentRound, parseApprovalHistory } from '@/lib/compensation/approval'
import { resolveApprovalFlow, type ApprovalMatrixCandidate } from '@/lib/finance/approval-flow-resolver'
import { approvalFlowRoleNames } from '@/lib/settings/approval-matrix'
import { loadRoleNameMap } from '@/lib/settings/queries/approval-matrix'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'
import { planExpenseApprovalNotices, type ApprovalNotice, type ExpenseQueueItem } from '@/lib/notifications/approval-notices'
import { dispatchNotificationAwaited } from '@/lib/notifications/dispatch'
import {
  adjustmentApprovalRequestedMessage,
  advanceApprovalRequestedMessage,
} from '@/lib/notifications/messages'
import type { NotificationMessage } from '@/lib/notifications/messages'
import {
  ORGANIZATION_SCOPE,
  usersWithCapability,
  type RecipientFilter,
  type RecipientScope,
} from '@/lib/notifications/recipients'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'

/**
 * แจ้งเตือน "ผู้อนุมัติขั้นที่รออยู่" ทันทีที่รายการเข้าคิวอนุมัติ — มติ PO 05/10/2569 U29 (BUG-106)
 *
 * ครอบทุกคิวที่มีขั้นอนุมัติ: รายการเบิก (ค่าตอบแทน/ค่าน้ำมัน/เบี้ยเลี้ยง/ค่าที่พัก/Manual Claim/เบิกส่วนเกินเงินทดรอง
 * — entity เดียวกันทั้งหมด `16`) · เงินทดรอง (`15`) · รายการปรับปรุง (`20`)
 *
 * กติกา (เหมือน `dispatch.ts`): เรียก **หลัง** `$transaction` commit เท่านั้น · ล้มแล้วห้ามพา flow ธุรกิจล้ม ·
 * ผู้รับหาจาก capability ของขั้นนั้น + scope ของเรื่อง · กันซ้ำด้วย `dedupeKey` (event ส่งซ้ำไม่แจ้งซ้ำ)
 * — endpoint ใช้รุ่นยิงแล้วลืม · job ใช้รุ่น `...Awaited` (ต้องรู้ว่าเขียนแถวแล้วก่อนจบรอบ)
 */

const AWAITING: readonly ExpenseStatus[] = ['pending_approval', 'pending_finance_approval']

/**
 * รันงานแจ้งเตือนทั้งก้อน (หาข้อมูล → หาผู้รับ → เขียนแถว) **ภายใต้ `after()` ตัวเดียว** — ต่างจาก
 * `dispatchToCapability()` ที่ผูก `after()` ตอนท้ายสุด: ที่นี่มี query อ่านรายการก่อนหาผู้รับ ถ้าปล่อยลอย
 * Vercel อาจ freeze instance ก่อนถึงขั้นเขียน · นอก request scope (job/เทสต์) ถอยเป็น promise ลอย
 * ล้มแล้ว log เท่านั้น — ห้ามพา flow ธุรกิจที่ commit แล้วล้มตาม
 */
function runDetached(label: string, context: Record<string, unknown>, task: () => Promise<unknown>): void {
  const run = (): Promise<void> =>
    task().then(
      () => undefined,
      (error: unknown) => {
        console.error(`[notifications] ${label}`, { ...context, error })
      },
    )
  try {
    after(run)
  } catch {
    void run()
  }
}

async function sendToCapability(
  organizationId: string,
  capability: string,
  scope: RecipientScope,
  message: NotificationMessage,
  filter: RecipientFilter,
): Promise<number> {
  const userIds = await usersWithCapability(organizationId, capability, scope, filter)
  return dispatchNotificationAwaited({ organizationId, userIds }, message)
}

// ── รายการเบิก ──────────────────────────────────────────────────────────────

/**
 * อ่านรายการที่ **ยังรออนุมัติอยู่จริง** แล้ว resolve ขั้น → capability ของขั้นนั้น
 * — แถวที่ไม่ได้อยู่ในคิว (รอคลัง/อนุมัติแล้ว/ถูกแทนที่) ถูกข้ามเงียบ ๆ ⇒ ผู้เรียกส่ง id ทั้งชุดได้เลย
 * · สายอนุมัติ: snapshot ของรายการ (ถ้ามี) ไม่งั้นคาดการณ์จาก matrix ปัจจุบันตามยอด (แบบเดียวกับหน้าคิว)
 * · ยังไม่ตั้งสายที่ครอบยอดนี้/สายอ้างบทบาทที่ไม่รู้จัก = ไม่มีใครอนุมัติได้ ⇒ ข้าม (log ไว้)
 */
export async function collectExpenseApprovalNotices(
  organizationId: string,
  expenseIds: readonly string[],
): Promise<ApprovalNotice[]> {
  const ids = [...new Set(expenseIds)]
  if (ids.length === 0) return []

  const rows = await prisma.expense.findMany({
    where: { organizationId, id: { in: ids }, status: { in: [...AWAITING] }, deletedAt: null },
    select: {
      id: true,
      expenseType: true,
      grossSatang: true,
      approvalStepCurrent: true,
      approvalStepTotal: true,
      approvalHistory: true,
      createdBy: true,
      approvalMatrix: { select: { approvalFlowRoleIds: true, enforceSegregationOfDuties: true } },
      payee: { select: { userId: true, user: { select: { fullName: true, teamId: true } } } },
      case: { select: { caseRef: true } },
      assignment: { select: { teamId: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (rows.length === 0) return []

  // สายเก็บ role id (มติ PO U149) — แปลงเป็นชื่อปัจจุบันก่อนส่งให้ตัวจับคู่ capability
  const roleNames = await loadRoleNameMap(organizationId)
  let candidates: ApprovalMatrixCandidate[] | null = null
  const loadCandidates = async (): Promise<ApprovalMatrixCandidate[]> => {
    if (candidates !== null) return candidates
    const matrices = await prisma.approvalMatrix.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        condition: true,
        conditionThresholdSatang: true,
        approvalFlowRoleIds: true,
        enforceSegregationOfDuties: true,
      },
    })
    candidates = matrices.map(({ approvalFlowRoleIds, ...matrix }) => ({
      ...matrix,
      approvalFlow: approvalFlowRoleNames(approvalFlowRoleIds, roleNames),
    }))
    return candidates
  }

  const items: ExpenseQueueItem[] = []
  for (const row of rows) {
    let steps: readonly string[]
    let totalSteps: number
    let enforceSod: boolean
    try {
      if (row.approvalMatrix !== null) {
        steps = approvalFlowRoleNames(row.approvalMatrix.approvalFlowRoleIds, roleNames)
        totalSteps = row.approvalStepTotal
        enforceSod = row.approvalMatrix.enforceSegregationOfDuties
      } else {
        const resolved = resolveApprovalFlow(row.grossSatang, await loadCandidates())
        steps = resolved.steps.map((step) => step.role)
        totalSteps = resolved.totalSteps
        enforceSod = resolved.enforceSegregationOfDuties
      }
      const stepRole = steps[row.approvalStepCurrent - 1]
      if (stepRole === undefined) continue
      const contract = approvalRoleContract(stepRole)

      const history = parseApprovalHistory(row.approvalHistory)
      const exclude = new Set<string>([row.payee.userId])
      // ผู้บันทึกแทน (การเงินบันทึก Manual Claim ให้คนอื่น) รู้อยู่แล้ว — เฉพาะตอนเข้าคิวครั้งแรก
      if (history.length === 0) exclude.add(row.createdBy)
      if (enforceSod) for (const approverId of approversInCurrentRound(history)) exclude.add(approverId)

      items.push({
        id: row.id,
        expenseType: row.expenseType,
        grossSatang: row.grossSatang,
        caseRef: row.case?.caseRef ?? null,
        requesterUserId: row.payee.userId,
        requesterName: row.payee.user.fullName,
        // มติ R6-B — ไม่ผูกงาน = ทีมของผู้เบิก (เกณฑ์เดียวกับ scope ของหน้าคิว)
        teamId: row.assignment?.teamId ?? row.payee.user.teamId,
        step: row.approvalStepCurrent,
        totalSteps,
        column: contract.column,
        capability: contract.capability,
        historyLength: history.length,
        excludeUserIds: [...exclude],
      })
    } catch (error) {
      if (error instanceof SettingsError && error.code === 'APPROVAL_MATRIX_NOT_FOUND') {
        console.warn('[notifications] ข้ามการแจ้งผู้อนุมัติ — ยังไม่มีสายอนุมัติครอบรายการนี้', { expenseId: row.id })
        continue
      }
      throw error
    }
  }
  return planExpenseApprovalNotices(items)
}

/** ยิงแล้วลืม — ใช้กับ endpoint ที่ผู้ใช้รอผล (หลัง commit) */
export function notifyExpensesAwaitingApproval(organizationId: string, expenseIds: readonly string[]): void {
  if (expenseIds.length === 0) return
  runDetached('แจ้งผู้อนุมัติรายการเบิกไม่สำเร็จ', { organizationId }, () =>
    notifyExpensesAwaitingApprovalAwaited(organizationId, expenseIds),
  )
}

/** รุ่นรอผล — ใช้กับ job (คืนจำนวนแถวแจ้งเตือนที่สร้างจริง · รันซ้ำได้ 0) */
export async function notifyExpensesAwaitingApprovalAwaited(
  organizationId: string,
  expenseIds: readonly string[],
): Promise<number> {
  const notices = await collectExpenseApprovalNotices(organizationId, expenseIds)
  let created = 0
  for (const notice of notices) {
    created += await sendToCapability(organizationId, notice.capability, notice.scope, notice.message, {
      excludeUserIds: notice.excludeUserIds,
    })
  }
  return created
}

// ── เงินทดรอง ────────────────────────────────────────────────────────────────

/**
 * คำขอเงินทดรองใหม่ → ผู้ถือ `approve_advance` (ขั้นเดียว · `15` §9) · scope = ทีมของผู้ขอ
 * (กลุ่ม system ได้เสมอ + ผู้จัดการ/หัวหน้าของทีมนั้นถ้าถูกมอบสิทธิ์นี้) · ผู้ขอ/ผู้บันทึกแทนไม่ได้รับ
 */
export function notifyAdvanceAwaitingApproval(organizationId: string, advanceId: string): void {
  runDetached('แจ้งผู้อนุมัติเงินทดรองไม่สำเร็จ', { organizationId, advanceId }, async () => {
    const row = await prisma.advance.findFirst({
      where: { id: advanceId, organizationId, status: 'pending_approval', deletedAt: null },
      select: {
        id: true,
        requestedSatang: true,
        purpose: true,
        dueClearDate: true,
        createdBy: true,
        payee: { select: { userId: true, user: { select: { fullName: true, teamId: true } } } },
      },
    })
    if (row === null) return
    await sendToCapability(
      organizationId,
      APPROVE_ADVANCE,
      { teamId: row.payee.user.teamId },
      advanceApprovalRequestedMessage({
        advanceId: row.id,
        requesterName: row.payee.user.fullName,
        requestedSatang: row.requestedSatang,
        purpose: row.purpose,
        dueClearDate: row.dueClearDate,
      }),
      { excludeUserIds: [row.payee.userId, row.createdBy] },
    )
  })
}

// ── รายการปรับปรุง ──────────────────────────────────────────────────────────

export interface AdjustmentAwaitingInput {
  id: string
  status: string
  adjustmentTypeLabel: string
  amountSatang: number
  targetLabel: string
  requesterName: string
  /** capability ของระดับนั้น (`approvalCapabilityFor(periodStatus)`) */
  capability: string
  /** บทบาทที่ยังขาดตามนโยบายของสถานะงวดที่ snapshot ไว้ (`20` §6.2) */
  missingRoles: readonly string[]
  excludeUserIds: readonly string[]
}

/**
 * แจ้ง "บทบาทที่ยังขาด" ของรายการปรับปรุง — ตอนสร้าง และหลังบทบาทแรกอนุมัติ (รอบที่ต้องสองบทบาท)
 * ผู้รับ = ถือ capability ของระดับนั้น **และ** role อยู่ในบทบาทที่ยังขาด (บทบาทที่อนุมัติแล้วไม่ต้องได้ซ้ำ)
 */
export function notifyAdjustmentAwaitingApproval(organizationId: string, input: AdjustmentAwaitingInput): void {
  if (input.status !== 'pending_approval' || input.missingRoles.length === 0) return
  runDetached('แจ้งผู้อนุมัติรายการปรับปรุงไม่สำเร็จ', { organizationId, adjustmentId: input.id }, () =>
    sendToCapability(
      organizationId,
      input.capability,
      ORGANIZATION_SCOPE,
      adjustmentApprovalRequestedMessage({
        adjustmentId: input.id,
        adjustmentTypeLabel: input.adjustmentTypeLabel,
        amountSatang: input.amountSatang,
        targetLabel: input.targetLabel,
        requesterName: input.requesterName,
        waitingRoles: input.missingRoles,
      }),
      { roleNames: input.missingRoles, excludeUserIds: input.excludeUserIds },
    ),
  )
}

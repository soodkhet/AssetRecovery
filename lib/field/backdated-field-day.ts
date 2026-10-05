import { AccountingError } from '@/lib/accounting/errors'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { AuthError } from '@/lib/auth/errors'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  computeFieldDay,
  findPendingFieldDays,
  isFieldDayPeriodLocked,
  persistFieldDaySettlement,
} from '@/lib/field/daily-allowance-job'
import type { BackdatedFieldDayInput } from '@/lib/field/backdated-schemas'
import { FieldError } from '@/lib/field/errors'
import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import { notifyExpensesAwaitingApprovalAwaited } from '@/lib/notifications/approval-queue'
import { prisma } from '@/lib/prisma'

/**
 * **สร้างรายการเบิกย้อนหลัง** ของวันลงพื้นที่ที่อยู่ในงวดปิด — มติ PO 05/10/2569 U50 (ต่อจาก U25/BUG-093)
 * `41` §6.6 · `22` §6.2/§6.3 · `91` §6.1 · `16` (สายอนุมัติเดิม)
 *
 * job `daily_field_allowance` ข้ามวันที่งวดปิดแล้ว (ไม่เขียนเข้างวดที่ปิด) และแจ้งการเงิน + บัญชี ⇒
 * การเงินกดปุ่มนี้เพื่อสร้างแถวรายวันของ (พนักงาน × วัน) นั้น:
 * - ยอดจาก `planFieldDayExpenses()` ชุดเดียวกับ job (แผนเวอร์ชัน ณ วันลงพื้นที่ — snapshot เมื่อเกิด)
 * - **expense date = วันนี้ (วันไทย) ในงวดที่เปิดอยู่** · อ้างวันลงพื้นที่เดิมผ่าน `field_day_settlements.field_date`
 *   + หมายเหตุบนรายการ + audit (actor = ผู้กด · reason บังคับ)
 * - เข้าสายอนุมัติปกติ (สถานะเริ่มต้นเหมือน job) + แจ้งผู้อนุมัติขั้น 1 (กลไก U29)
 * - แถว settlement เกิด ⇒ เกตรายได้ `field_days_not_settled` ของเคสวันนั้นปลด · job รอบถัดไปไม่ settle ซ้ำ
 * - **idempotent**: UNIQUE (องค์กร, พนักงาน, วัน) — กดซ้ำ/สองคนกดพร้อมกัน ได้แถวชุดเดียว (`created: false`)
 *
 * สิทธิ์: `create_adjustment` (manage) — ตรวจที่ API (`withApiPermission`) และซ้ำที่นี่ (DEC-002)
 */

export interface LockedFieldDayDto {
  agentId: string
  agentName: string
  /** วันลงพื้นที่ `YYYY-MM-DD` (วันไทย — จอแปลงเป็น พ.ศ.) */
  fieldDate: string
  caseCount: number
  fuelSatang: number
  allowanceSatang: number
  totalSatang: number
}

export interface BackdatedFieldDayResult {
  /** `false` = วันนั้นถูกสร้างไปแล้ว (กดซ้ำ/คนอื่นกดก่อน/job ทำไปแล้ว) — ไม่สร้างซ้ำ */
  created: boolean
  settlementId: string | null
  expenseIds: string[]
  /** วันที่ลงรายการ (วันไทยในงวดที่เปิดอยู่) */
  expenseDate: string
  revenueIdsCreated: readonly string[]
  approvalNotified: number
}

const LIST_LIMIT = 200

function assertCanCreate(user: SessionUser): void {
  if (!hasCapability(user, 'manage', CREATE_ADJUSTMENT)) {
    throw new AuthError('PERMISSION_DENIED', `capability=${CREATE_ADJUSTMENT} user=${user.id}`)
  }
}

/**
 * วันลงพื้นที่ที่รอ "สร้างรายการเบิกย้อนหลัง" — มีเช็คอินแต่ยังไม่ settle + งวดของวันนั้นปิดแล้ว + มียอด
 * (ระดับองค์กร — ผู้เรียกผ่านยามสิทธิ์ที่ API แล้ว)
 */
export async function listLockedFieldDays(user: SessionUser, now: Date = new Date()): Promise<LockedFieldDayDto[]> {
  const pending = await findPendingFieldDays({
    organizationId: user.organizationId,
    date: null,
    today: bangkokBusinessDate(now),
    limit: LIST_LIMIT,
  })
  const result: LockedFieldDayDto[] = []
  const lockedCache = new Map<string, boolean>()
  for (const day of pending) {
    const monthKey = day.fieldDate.toISOString().slice(0, 7)
    let locked = lockedCache.get(monthKey)
    if (locked === undefined) {
      locked = await isFieldDayPeriodLocked(day.organizationId, day.fieldDate)
      lockedCache.set(monthKey, locked)
    }
    if (!locked) continue
    const computed = await computeFieldDay(day)
    if (computed === null || computed.planned.drafts.length === 0) continue
    result.push({
      agentId: day.agentId,
      agentName: '',
      fieldDate: day.fieldDate.toISOString().slice(0, 10),
      caseCount: computed.planned.orderedCaseIds.length,
      fuelSatang: computed.planned.fuelTotalSatang,
      allowanceSatang: computed.planned.allowanceTotalSatang,
      totalSatang: computed.planned.fuelTotalSatang + computed.planned.allowanceTotalSatang,
    })
  }
  if (result.length === 0) return result
  const agents = await prisma.user.findMany({
    where: { organizationId: user.organizationId, id: { in: [...new Set(result.map((row) => row.agentId))] } },
    select: { id: true, fullName: true },
  })
  const nameOf = new Map(agents.map((agent) => [agent.id, agent.fullName]))
  return result.map((row) => ({ ...row, agentName: nameOf.get(row.agentId) ?? 'พนักงาน' }))
}

export async function createBackdatedFieldDayExpenses(
  ctx: { actor: SessionUser; meta: RequestMeta },
  input: BackdatedFieldDayInput,
  now: Date = new Date(),
): Promise<BackdatedFieldDayResult> {
  const { actor } = ctx
  assertCanCreate(actor)
  const organizationId = actor.organizationId
  const day = { organizationId, agentId: input.agentId, fieldDate: input.fieldDate }
  const expenseDate = bangkokBusinessDate(now)
  const expenseDateIso = expenseDate.toISOString().slice(0, 10)

  const existing = await prisma.fieldDaySettlement.findFirst({
    where: { organizationId, agentId: input.agentId, fieldDate: input.fieldDate },
    select: { id: true, expenses: { select: { id: true } } },
  })
  if (existing !== null) {
    return {
      created: false,
      settlementId: existing.id,
      expenseIds: existing.expenses.map((row) => row.id),
      expenseDate: expenseDateIso,
      revenueIdsCreated: [],
      approvalNotified: 0,
    }
  }

  const computed = await computeFieldDay(day)
  if (computed === null) {
    throw new FieldError('FIELD_DAY_NOT_FOUND', {
      detail: `agent=${input.agentId} field_date=${input.fieldDate.toISOString().slice(0, 10)}`,
    })
  }
  // งวดของวันลงพื้นที่ยังไม่ปิด ⇒ job รอบปกติคิดให้เอง (ไม่ต้องเบิกย้อนหลัง)
  if (!(await isFieldDayPeriodLocked(organizationId, input.fieldDate))) {
    throw new AccountingError('PERIOD_INVALID_STATUS', {
      detail: `งวดของวันลงพื้นที่ ${input.fieldDate.toISOString().slice(0, 10)} ยังไม่ปิด — ให้ job รายวันคำนวณตามปกติ`,
    })
  }
  // วันที่ลงรายการต้องอยู่ในงวดที่เปิดอยู่ (`13` §6.11) — งวดปัจจุบันปิดด้วย ⇒ PERIOD_LOCKED_DIRECT_EDIT
  await assertPeriodOpenAt({ organizationId, at: expenseDate, targetType: 'expenses' })

  const outcome = await persistFieldDaySettlement(day, computed, {
    kind: 'backdated',
    actorId: actor.id,
    actorRole: actor.roleName,
    reason: input.reason,
    expenseDate,
    ipAddress: ctx.meta.ipAddress,
    userAgent: ctx.meta.userAgent,
  })

  if (outcome.kind === 'already_settled') {
    // แพ้การแข่ง (อีกคน/job สร้างไปก่อนเสี้ยววินาที) — คืนชุดที่มีอยู่ ไม่สร้างซ้ำ
    const winner = await prisma.fieldDaySettlement.findFirst({
      where: { organizationId, agentId: input.agentId, fieldDate: input.fieldDate },
      select: { id: true, expenses: { select: { id: true } } },
    })
    return {
      created: false,
      settlementId: winner?.id ?? null,
      expenseIds: winner?.expenses.map((row) => row.id) ?? [],
      expenseDate: expenseDateIso,
      revenueIdsCreated: [],
      approvalNotified: 0,
    }
  }

  // มติ PO U29 — แถวที่เข้าคิวอนุมัติแจ้งผู้อนุมัติขั้น 1 · ล้มห้ามทำให้คำขอที่บันทึกแล้วล้ม
  const approvalNotified = await notifyExpensesAwaitingApprovalAwaited(organizationId, outcome.expenseIds).catch(
    (error: unknown) => {
      console.error('[backdated_field_day] แจ้งผู้อนุมัติไม่สำเร็จ', { day, error })
      return 0
    },
  )
  return {
    created: true,
    settlementId: outcome.settlementId,
    expenseIds: outcome.expenseIds,
    expenseDate: expenseDateIso,
    revenueIdsCreated: outcome.revenueIds,
    approvalNotified,
  }
}

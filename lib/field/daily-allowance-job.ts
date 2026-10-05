import { periodKeyOf } from '@/lib/accounting/period'
import { periodStatusAt } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import {
  initialFieldDayExpenseStatus,
  planFieldDayExpenses,
  type FieldDayCase,
  type FieldDayExpensePlan,
} from '@/lib/field/expense-calc'
import {
  bangkokBusinessDate,
  ensureAgentPayeeId,
  resolvePlanSnapshot,
  type ExpenseTxClient,
  type PlanSnapshot,
} from '@/lib/field/expense-queries'
import { endOfBangkokDay, fmtDate, startOfBangkokDay } from '@/lib/format/datetime'
import { Prisma } from '@/lib/generated/prisma/client'
import type { CaseOutcome } from '@/lib/generated/prisma/enums'
import { parseSettleDate } from '@/lib/jobs/job-types'
import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { MANAGE_ACCOUNTING_PERIOD } from '@/lib/accounting/period'
import { notifyExpensesAwaitingApprovalAwaited } from '@/lib/notifications/approval-queue'
import { dispatchNotificationAwaited } from '@/lib/notifications/dispatch'
import { fieldAllowancePeriodLockedMessage } from '@/lib/notifications/messages'
import { ORGANIZATION_SCOPE, usersWithCapability } from '@/lib/notifications/recipients'
import { prisma } from '@/lib/prisma'
import { isDirectEditRejected } from '@/lib/settings/period-lock'
import type { WarehouseTxClient } from '@/lib/warehouse/asset-hook'
import { tryCreateRevenue } from '@/lib/warehouse/revenue-service'

/**
 * Job `daily_field_allowance` — มติ PO 03/10/2569 (UAT Q21 · DEC-012 · `22` §6.2/§6.3 · `41` §6.6 · `91` §6.1)
 *
 * ค่าน้ำมันเหมาจ่าย (`DAILY_FLAT`) + เบี้ยเลี้ยง (ทุกโหมด) = **วันละ 1 ครั้งต่อพนักงานต่อวันปฏิทินไทย**
 * ที่มีเช็คอินอย่างน้อย 1 เคส → กระจายเฉลี่ยเท่ากันทุกเคสที่เช็คอินวันนั้น (เศษลงเคสแรก) แล้วสร้าง
 * expense ต่อเคส · รันหลังเที่ยงคืนเวลาไทย ประมวลผลเฉพาะ "วันที่จบแล้ว" (`field_date < วันนี้`)
 *
 * ### idempotent (`91` — ทุก job)
 * - 1 (องค์กร, พนักงาน, วัน) = 1 แถว `field_day_settlements` · UNIQUE ระดับ DB
 *   `uniq_field_day_settlements_org_agent_date` ⇒ รันซ้ำ/รันพร้อมกัน ตัวที่แพ้ได้ P2002 → ข้าม (ไม่ซ้ำ)
 * - แถว settlement + expenses + audit + การตรวจรายได้ อยู่ในทรานแซกชันเดียว ⇒ ไม่มีครึ่ง ๆ กลาง ๆ
 * - วันที่ยอด 0 (ทีมไม่ผูกแผน/แผนไม่ตั้งอัตรา) ก็ยังลงแถว settlement (ยอด 0, ไม่มี expense) — เพื่อให้
 *   เกตรายได้รู้ว่า "วันนั้นคิดแล้ว" (`19` §6.1)
 *
 * ### เช็คอินที่มาหลัง settle (กันยอดเกิน D)
 * cron settle เฉพาะวันที่จบแล้ว จึงเกิดไม่ได้ตามปกติ · ถ้าสั่ง settle "วันนี้" ผ่าน dev trigger แล้วมี
 * เช็คอินเพิ่มภายหลัง วันนั้นถือว่าคิดเงินครบแล้ว (ยอด D ถูกกระจายไปแล้วทั้งก้อน) — เคสใหม่ไม่ได้
 * ส่วนแบ่งเพิ่มและไม่ทำให้ยอดเกิน D
 *
 * ### ข้อมูลเดิมก่อนมติ Q21
 * รอบติดตามที่ตอนปิดงานสร้าง allowance / fuel เหมาจ่าย "ต่อเคส" ไว้แล้ว (แถว `compensation_plan` ที่ไม่มี
 * `field_day_settlement_id`) = จ่ายวันเหล่านั้นไปแล้ว ⇒ ไม่นับเป็นผู้รับส่วนแบ่งซ้ำ
 *
 * actor = ระบบ (`actor_id = NULL`) ⇒ `reason` ต้องมี job id (`90` §13)
 */

export const DAILY_FIELD_ALLOWANCE_JOB_TYPE = 'daily_field_allowance'

export interface DailyFieldAllowanceJobOptions {
  organizationId?: string
  /** id ของ job runner — ลง `reason` ของ audit + `field_day_settlements.job_id` */
  jobId?: string
  now?: Date
  /**
   * settle เฉพาะวันนี้ (`YYYY-MM-DD` วันไทย) — **รับจาก dev trigger เท่านั้น** (ตัวรันงานกรองให้แล้ว)
   * ต้อง ≤ วันนี้ · ไม่ระบุ = ทุกวันที่จบแล้วที่ยังไม่ถูก settle (ตามรอบ cron + เก็บตกวันที่พลาด)
   */
  date?: string
  /** จำนวน (พนักงาน, วัน) สูงสุดต่อรอบ */
  limit?: number
}

export interface DailyFieldAllowanceJobResult {
  settled: number
  /** ชนกับอีก instance ที่ settle ไปก่อน (P2002) */
  alreadySettled: number
  /** งวดบัญชีของวันนั้นปิดแล้ว — สร้างรายการเบิกย้อนเข้างวดไม่ได้ (ต้องไป Adjustment) */
  periodLocked: number
  /**
   * แถวแจ้งเตือนฝ่ายการเงินที่สร้างจริงจากวันที่งวดปิดแล้ว (มติ PO U25) — รันซ้ำวันเดิม = 0 (กันซ้ำด้วยคีย์ต่อพนักงาน×วัน)
   */
  periodLockedNotified: number
  /** แถวแจ้งเตือนผู้อนุมัติของรายการที่เข้าคิวอนุมัติ (มติ PO U29) */
  approvalNotified: number
  expensesCreated: number
  revenueIdsCreated: string[]
}

export interface PendingFieldDay {
  organizationId: string
  agentId: string
  fieldDate: Date
}

/** (องค์กร, พนักงาน, วันไทย) ที่มีเช็คอินแต่ยังไม่มีแถว settlement */
export async function findPendingFieldDays(params: {
  organizationId?: string
  date: Date | null
  today: Date
  limit: number
}): Promise<PendingFieldDay[]> {
  const dayExpr = Prisma.sql`(ci.checked_in_at AT TIME ZONE 'Asia/Bangkok')::date`
  const dateFilter =
    params.date === null ? Prisma.sql`${dayExpr} < ${params.today}::date` : Prisma.sql`${dayExpr} = ${params.date}::date`
  const orgFilter =
    params.organizationId === undefined
      ? Prisma.empty
      : Prisma.sql`AND ci.organization_id = ${params.organizationId}::uuid`

  return prisma.$queryRaw<PendingFieldDay[]>`
    SELECT ci.organization_id::text AS "organizationId",
           a.agent_id::text        AS "agentId",
           ${dayExpr}              AS "fieldDate"
      FROM check_ins ci
      JOIN case_assignments a ON a.id = ci.assignment_id
     WHERE ${dateFilter} ${orgFilter}
       AND NOT EXISTS (
             SELECT 1 FROM field_day_settlements s
              WHERE s.organization_id = ci.organization_id
                AND s.agent_id = a.agent_id
                AND s.field_date = ${dayExpr}
           )
     GROUP BY 1, 2, 3
     ORDER BY 3, 1, 2
     LIMIT ${params.limit}
  `
}

export async function runDailyFieldAllowanceJob(
  options: DailyFieldAllowanceJobOptions = {},
): Promise<DailyFieldAllowanceJobResult> {
  const now = options.now ?? new Date()
  const jobId = options.jobId ?? DAILY_FIELD_ALLOWANCE_JOB_TYPE
  const today = bangkokBusinessDate(now)
  let date: Date | null = null
  if (options.date !== undefined) {
    date = parseSettleDate(options.date, now)
    if (date === null) throw new RangeError(`วันที่ที่สั่งคำนวณ "${options.date}" ไม่ถูกต้องหรือเกินวันนี้`)
  }

  const result: DailyFieldAllowanceJobResult = {
    settled: 0,
    alreadySettled: 0,
    periodLocked: 0,
    periodLockedNotified: 0,
    approvalNotified: 0,
    expensesCreated: 0,
    revenueIdsCreated: [],
  }

  const pending = await findPendingFieldDays({
    ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    date,
    today,
    limit: options.limit ?? 500,
  })

  for (const day of pending) {
    const outcome = await settleFieldDay(day, { kind: 'job', jobId, realJobId: options.jobId ?? null })
    if (outcome.kind === 'settled') {
      result.settled += 1
      result.expensesCreated += outcome.expenseIds.length
      result.revenueIdsCreated.push(...outcome.revenueIds)
      // มติ PO U29 — แถวที่เข้าคิวอนุมัติทันที (ไม่ต้องรอคลัง) แจ้งผู้อนุมัติขั้น 1 · ล้มห้ามทำให้รอบนี้ล้ม
      result.approvalNotified += await notifyExpensesAwaitingApprovalAwaited(day.organizationId, outcome.expenseIds).catch(
        (error: unknown) => {
          console.error('[daily_field_allowance] แจ้งผู้อนุมัติไม่สำเร็จ', { day, error })
          return 0
        },
      )
    } else if (outcome.kind === 'already_settled') result.alreadySettled += 1
    else {
      result.periodLocked += 1
      result.periodLockedNotified += await notifyPeriodLockedFieldDay(day, outcome)
    }
  }
  return result
}

/**
 * มติ PO 05/10/2569 U25 (BUG-093) + U50 — วันที่อยู่ในงวดที่ปิดแล้ว **job ยังข้ามเหมือนเดิม** (ไม่ settle ข้ามงวด)
 * แต่แจ้ง **ทั้งการเงิน** (ผู้ถือ `create_adjustment` — กด "สร้างรายการเบิกย้อนหลัง" ได้) **และบัญชี**
 * (ผู้ถือ `manage_accounting_period` — รับทราบว่ารายการจะลงงวดที่เปิดอยู่) พร้อมยอดจาก `planFieldDayExpenses()`
 * · วันนั้นไม่มีแถว settlement ⇒ job คืนถัดไปเจอวันเดิมอีก — คีย์กันซ้ำ (พนักงาน × วัน ต่อผู้รับ) ทำให้ไม่แจ้งซ้ำ
 * · คนที่ถือทั้งสองสิทธิ์ได้ข้อความฝั่งการเงินใบเดียว
 */
async function notifyPeriodLockedFieldDay(
  day: PendingFieldDay,
  locked: Extract<SettleOutcome, { kind: 'period_locked' }>,
): Promise<number> {
  const agent = await prisma.user.findFirst({
    where: { id: day.agentId, organizationId: day.organizationId },
    select: { fullName: true },
  })
  const financeIds = await usersWithCapability(day.organizationId, CREATE_ADJUSTMENT, ORGANIZATION_SCOPE)
  const accountingIds = (
    await usersWithCapability(day.organizationId, MANAGE_ACCOUNTING_PERIOD, ORGANIZATION_SCOPE)
  ).filter((id) => !financeIds.includes(id))
  const input = {
    agentId: day.agentId,
    agentName: agent?.fullName ?? 'พนักงาน',
    fieldDate: day.fieldDate,
    caseCount: locked.caseCount,
    fuelSatang: locked.fuelSatang,
    allowanceSatang: locked.allowanceSatang,
  }
  const toFinance = await dispatchNotificationAwaited(
    { organizationId: day.organizationId, userIds: financeIds },
    fieldAllowancePeriodLockedMessage(input, 'finance'),
  )
  const toAccounting =
    accountingIds.length === 0
      ? 0
      : await dispatchNotificationAwaited(
          { organizationId: day.organizationId, userIds: accountingIds },
          fieldAllowancePeriodLockedMessage(input, 'accounting'),
        )
  return toFinance + toAccounting
}

type SettleOutcome =
  | { kind: 'settled'; settlementId: string; expenseIds: string[]; revenueIds: readonly string[] }
  | { kind: 'already_settled' }
  | { kind: 'period_locked'; caseCount: number; fuelSatang: number; allowanceSatang: number }

/**
 * ทางที่สร้างแถวรายวัน — `job` = รอบเวลาปกติ (actor = ระบบ · expense date = วันลงพื้นที่) ·
 * `backdated` = "สร้างรายการเบิกย้อนหลัง" ของวันที่อยู่ในงวดปิด (มติ PO 05/10/2569 U50 · actor = การเงิน ·
 * expense date = วันในงวดที่เปิดอยู่ · อ้างวันลงพื้นที่เดิมผ่าน `field_day_settlements.field_date` + หมายเหตุ)
 */
export type FieldDaySettleMode =
  | { kind: 'job'; jobId: string; realJobId: string | null }
  | {
      kind: 'backdated'
      actorId: string
      actorRole: string
      reason: string
      /** วันที่ลงรายการ (วันไทยในงวดที่เปิดอยู่ — ผู้เรียกตรวจงวดแล้ว) */
      expenseDate: Date
      ipAddress: string | null
      userAgent: string | null
    }

/** ผลคำนวณของ (พนักงาน, วัน) — สูตรเดียวทั้ง job และเบิกย้อนหลัง (`planFieldDayExpenses()`) */
export interface FieldDayComputation {
  byCase: Map<string, FieldDayCase & { outcome: CaseOutcome | null }>
  allCaseIds: string[]
  plan: PlanSnapshot | null
  planned: FieldDayExpensePlan
}

/** คำนวณยอดของวันนั้นโดยไม่เขียนอะไร — `null` = ไม่มีเช็คอิน (ไม่มีวันลงพื้นที่นี้) */
export async function computeFieldDay(day: PendingFieldDay): Promise<FieldDayComputation | null> {
  const checkins = await prisma.checkIn.findMany({
    where: {
      organizationId: day.organizationId,
      assignment: { agentId: day.agentId },
      checkedInAt: { gte: startOfBangkokDay(day.fieldDate), lte: endOfBangkokDay(day.fieldDate) },
    },
    orderBy: [{ checkedInAt: 'asc' }, { id: 'asc' }],
    select: {
      caseId: true,
      assignmentId: true,
      checkedInAt: true,
      assignment: { select: { team: { select: { compensationPlanId: true } } } },
      case: { select: { outcome: true } },
    },
  })
  const first = checkins[0]
  if (first === undefined) return null

  // เคสละ 1 ที่นั่ง — ใช้เช็คอินแรกของเคสในวันนั้น (เวลา + รอบติดตามที่เช็คอิน)
  const byCase = new Map<string, FieldDayCase & { outcome: CaseOutcome | null }>()
  for (const row of checkins) {
    if (!byCase.has(row.caseId)) {
      byCase.set(row.caseId, {
        caseId: row.caseId,
        assignmentId: row.assignmentId,
        firstCheckedInAt: row.checkedInAt,
        outcome: row.case.outcome,
      })
    }
  }
  const allCaseIds = [...byCase.keys()]

  // รอบติดตามที่ปิดงานไปแล้วด้วยกติกาเดิม (allowance / น้ำมันเหมา "ต่อเคส") = จ่ายวันเหล่านั้นไปแล้ว
  const legacy = await prisma.expense.findMany({
    where: {
      organizationId: day.organizationId,
      assignmentId: { in: [...new Set([...byCase.values()].map((row) => row.assignmentId))] },
      calculationSource: 'compensation_plan',
      fieldDaySettlementId: null,
      status: { not: 'superseded' },
      deletedAt: null,
      OR: [{ expenseType: 'allowance' }, { expenseType: 'fuel', distanceKm: null }],
    },
    select: { assignmentId: true },
  })
  const legacyAssignments = new Set(legacy.map((row) => row.assignmentId))
  const shareCases = [...byCase.values()].filter((row) => !legacyAssignments.has(row.assignmentId))

  // แผน (เวอร์ชัน) ของทีม ณ วันนั้น — ทีมของรอบติดตามที่เช็คอินแรกของวัน (`92` §7.1 snapshot เมื่อเกิด)
  const teamPlanId = first.assignment.team.compensationPlanId
  const plan: PlanSnapshot | null =
    teamPlanId === null
      ? null
      : await resolvePlanSnapshot(prisma as ExpenseTxClient, {
          organizationId: day.organizationId,
          planId: teamPlanId,
          onDate: day.fieldDate,
        })

  const planned: FieldDayExpensePlan =
    plan === null
      ? { fuelTotalSatang: 0, allowanceTotalSatang: 0, orderedCaseIds: [], drafts: [] }
      : planFieldDayExpenses({ plan, cases: shareCases })

  return { byCase, allCaseIds, plan, planned }
}

/** งวดของวันลงพื้นที่ปิดแล้ว (เขียนรายการเบิกตรงเข้างวดนั้นไม่ได้ — `13` §6.11) */
export async function isFieldDayPeriodLocked(organizationId: string, fieldDate: Date): Promise<boolean> {
  const status = await periodStatusAt(organizationId, periodKeyOf(fieldDate))
  return status !== null && isDirectEditRejected(status, true)
}

async function settleFieldDay(day: PendingFieldDay, mode: FieldDaySettleMode): Promise<SettleOutcome> {
  const computed = await computeFieldDay(day)
  if (computed === null) return { kind: 'already_settled' }

  // Period Lock (`13` §6.11) — สร้างรายการเบิกย้อนเข้างวดที่ปิดแล้วไม่ได้ ⇒ เว้นวันนั้นไว้ให้คนตัดสิน
  // (มติ PO U50: การเงินกด "สร้างรายการเบิกย้อนหลัง" ลงงวดที่เปิดอยู่ — `lib/field/backdated-field-day.ts`)
  if (computed.planned.drafts.length > 0 && (await isFieldDayPeriodLocked(day.organizationId, day.fieldDate))) {
    // ยอดเดียวกับที่จะ settle ถ้างวดยังเปิด (สูตร `22` §6.2/§6.3 ผ่าน `planFieldDayExpenses()`) — ส่งต่อให้การแจ้งเตือน
    return {
      kind: 'period_locked',
      caseCount: computed.planned.orderedCaseIds.length,
      fuelSatang: computed.planned.fuelTotalSatang,
      allowanceSatang: computed.planned.allowanceTotalSatang,
    }
  }
  return persistFieldDaySettlement(day, computed, mode)
}

/**
 * ล็อกแถวเคส (FOR UPDATE · เรียงตาม id — โหมด/ลำดับเดียวกับ `tryCreateRevenue()`) แล้วคืนผลเคสล่าสุด — BUG-092
 */
async function lockCaseOutcomes(
  tx: ExpenseTxClient,
  organizationId: string,
  caseIds: readonly string[],
): Promise<Map<string, CaseOutcome | null>> {
  const sorted = [...new Set(caseIds)].sort()
  if (sorted.length === 0) return new Map()
  const rows = await tx.$queryRaw<{ id: string; outcome: CaseOutcome | null }[]>`
    SELECT id::text AS id, outcome::text AS outcome
      FROM cases
     WHERE organization_id = ${organizationId}::uuid
       AND id = ANY(${sorted}::uuid[])
     ORDER BY id
       FOR UPDATE
  `
  return new Map(rows.map((row) => [row.id, row.outcome]))
}

/**
 * เขียนแถว settlement + expenses + audit + ตรวจรายได้ ในทรานแซกชันเดียว — ใช้ร่วม job และเบิกย้อนหลัง (U50)
 * UNIQUE (องค์กร, พนักงาน, วัน) ⇒ สองทางชนกัน/กดซ้ำ ตัวที่แพ้ได้ `already_settled` (ไม่สร้างซ้ำ)
 */
export async function persistFieldDaySettlement(
  day: PendingFieldDay,
  computed: FieldDayComputation,
  mode: FieldDaySettleMode,
): Promise<Exclude<SettleOutcome, { kind: 'period_locked' }>> {
  const { byCase, allCaseIds, plan, planned } = computed
  const draftCaseIds = [...new Set(planned.drafts.map((row) => row.caseId))]
  const assets = await prisma.asset.findMany({
    where: { caseId: { in: draftCaseIds }, deletedAt: null },
    select: { caseId: true, lot: { select: { status: true } } },
  })
  const lotConfirmed = (caseId: string): boolean => {
    const rows = assets.filter((row) => row.caseId === caseId)
    return rows.length > 0 && rows.every((row) => row.lot?.status === 'confirmed')
  }

  const fieldDateIso = day.fieldDate.toISOString().slice(0, 10)
  const backdated = mode.kind === 'backdated' ? mode : null
  const expenseDate = backdated === null ? day.fieldDate : backdated.expenseDate
  const expenseDateIso = expenseDate.toISOString().slice(0, 10)
  const reasonPrefix =
    backdated === null
      ? `[job:${mode.kind === 'job' ? mode.jobId : ''}] คำนวณค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของวันที่ ${fieldDateIso}`
      : `${backdated.reason} — สร้างรายการเบิกย้อนหลังของวันลงพื้นที่ ${fmtDate(day.fieldDate)} (งวดของวันนั้นปิดแล้ว) ลงวันที่ ${fmtDate(expenseDate)}`
  const actor =
    backdated === null
      ? { actorId: null, actorRole: null }
      : {
          actorId: backdated.actorId,
          actorRole: backdated.actorRole,
          ipAddress: backdated.ipAddress,
          userAgent: backdated.userAgent,
        }
  const revisionNote =
    backdated === null ? null : `เบิกย้อนหลังของวันลงพื้นที่ ${fmtDate(day.fieldDate)} (งวดของวันนั้นปิดแล้ว)`
  const ownerId = backdated === null ? day.agentId : backdated.actorId

  try {
    return await prisma.$transaction(async (tx) => {
      // BUG-092 — ผลเคสที่อ่านไว้นอกทรานแซกชันอาจเก่าแล้ว (พนักงานปิดงานสำเร็จระหว่างที่ job คำนวณ) ⇒ ล็อกแถว
      // `cases` แล้วอ่านใหม่: ถ้าการปิดงานได้ล็อกก่อน ที่นี่รอจน commit แล้วเห็น `closed_success`
      // (แถวเริ่มที่ `pending_warehouse_confirm`) · ถ้าที่นี่ได้ก่อน การปิดงานรอ แล้ว `holdFieldDayExpensesForWarehouse()`
      // เห็นแถวที่ commit แล้วและย้ายไปรอคลังให้ ⇒ ไม่มีแถวของเคสสำเร็จหลุดเป็น `pending_approval`
      // ล็อก **ชุดเดียวกับ** `tryCreateRevenue()` ท้ายทรานแซกชัน (ทุกเคสของวัน · FOR UPDATE · เรียง id) — ไม่งั้น
      // สองทรานแซกชันที่ถือล็อกคนละชุด/คนละโหมดแล้วขอเพิ่มทีหลังจะ deadlock กันเอง
      const currentOutcomes = await lockCaseOutcomes(tx as ExpenseTxClient, day.organizationId, allCaseIds)
      const settlement = await tx.fieldDaySettlement.create({
        data: {
          organizationId: day.organizationId,
          agentId: day.agentId,
          fieldDate: day.fieldDate,
          compPlanId: plan?.planId ?? null,
          compPlanVersion: plan?.version ?? null,
          fuelTotalSatang: planned.fuelTotalSatang,
          allowanceTotalSatang: planned.allowanceTotalSatang,
          caseCount: planned.orderedCaseIds.length,
          jobId: mode.kind === 'job' ? mode.realJobId : null,
          createdBy: backdated === null ? null : backdated.actorId,
        },
        select: { id: true },
      })

      const expenseIds: string[] = []
      if (planned.drafts.length > 0 && plan !== null) {
        const payeeId = await ensureAgentPayeeId(tx as ExpenseTxClient, {
          organizationId: day.organizationId,
          userId: day.agentId,
          actorId: ownerId,
        })
        for (const draft of planned.drafts) {
          const outcome = currentOutcomes.has(draft.caseId)
            ? (currentOutcomes.get(draft.caseId) ?? null)
            : (byCase.get(draft.caseId)?.outcome ?? null)
          const status = initialFieldDayExpenseStatus(outcome, lotConfirmed(draft.caseId))
          const created = await tx.expense.create({
            data: {
              organizationId: day.organizationId,
              caseId: draft.caseId,
              assignmentId: draft.assignmentId,
              payeeId,
              expenseType: draft.expenseType,
              grossSatang: draft.grossSatang,
              expenseDate,
              calculationSource: 'compensation_plan',
              compPlanId: plan.planId,
              compPlanVersion: plan.version,
              fieldDaySettlementId: settlement.id,
              status,
              revisionNote,
              // `expenses.created_by` บังคับ NOT NULL — job ใช้เจ้าของรายการแบบเดียวกับ `fuel_distance_retry`
              createdBy: ownerId,
            },
            select: { id: true },
          })
          expenseIds.push(created.id)

          await emitAudit(
            {
              organizationId: day.organizationId,
              ...actor,
              action: 'create',
              targetType: 'expenses',
              targetId: created.id,
              after: {
                caseId: draft.caseId,
                assignmentId: draft.assignmentId,
                expenseType: draft.expenseType,
                grossSatang: draft.grossSatang,
                expenseDate: expenseDateIso,
                status,
                fieldDaySettlementId: settlement.id,
                compPlanId: plan.planId,
                compPlanVersion: plan.version,
                ...(backdated === null ? {} : { backdated: true, fieldDate: fieldDateIso }),
                events: ['expense.case_bound_created'],
              },
              reason: `${reasonPrefix} — ส่วนแบ่งของเคสนี้`,
              diffOnly: false,
            },
            tx as ExpenseTxClient,
          )
        }
      }

      await emitAudit(
        {
          organizationId: day.organizationId,
          ...actor,
          action: 'create',
          targetType: 'field_day_settlements',
          targetId: settlement.id,
          after: {
            agentId: day.agentId,
            fieldDate: fieldDateIso,
            ...(backdated === null ? {} : { backdated: true, expenseDate: expenseDateIso }),
            compPlanId: plan?.planId ?? null,
            compPlanVersion: plan?.version ?? null,
            fuelTotalSatang: planned.fuelTotalSatang,
            allowanceTotalSatang: planned.allowanceTotalSatang,
            caseIds: planned.orderedCaseIds,
            legacyCaseIds: allCaseIds.filter((id) => !planned.orderedCaseIds.includes(id)),
            expenseIds,
          },
          reason: `${reasonPrefix} — กระจายเท่ากันทุกเคสที่เช็คอินวันนั้น`,
          diffOnly: false,
        },
        tx as ExpenseTxClient,
      )

      // เกตรายได้ "ทุกวันที่ลงพื้นที่ settle แล้ว" อาจเพิ่งครบที่นี่ (เคสที่วันนี้ไม่มีแถวใหม่ให้อนุมัติ
      // เช่น ยอด 0 / ข้อมูลเดิม) ⇒ ตรวจให้เลย · เคสที่มีแถวใหม่ยังติดอนุมัติ — ขั้นอนุมัติแถวสุดท้ายเรียกเอง
      const revenue = await tryCreateRevenue(tx as WarehouseTxClient, {
        organizationId: day.organizationId,
        caseIds: allCaseIds,
        actorId: ownerId,
      })

      return {
        kind: 'settled' as const,
        settlementId: settlement.id,
        expenseIds,
        revenueIds: revenue.revenueIdsCreated,
      }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { kind: 'already_settled' }
    }
    throw error
  }
}

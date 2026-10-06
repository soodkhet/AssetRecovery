import { AccountingError } from '@/lib/accounting/errors'
import { MANAGE_ACCOUNTING_PERIOD, periodKeyOf } from '@/lib/accounting/period'
import { assertPeriodOpenAt, periodStatusAt } from '@/lib/accounting/period-guard'
import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import type { BackdatedFuelExpenseInput } from '@/lib/field/backdated-schemas'
import { fmtDate } from '@/lib/format/datetime'
import type { CaseOutcome } from '@/lib/generated/prisma/enums'
import { JobError } from '@/lib/jobs/errors'
import { dispatchNotificationAwaited } from '@/lib/notifications/dispatch'
import { fuelPeriodLockedMessage } from '@/lib/notifications/messages'
import { ORGANIZATION_SCOPE, usersWithCapability } from '@/lib/notifications/recipients'
import { kmHundredthsToDecimalString, metersToKmHundredths, routePoints } from '@/lib/field/distance'
import { DistanceUnavailableError, resolveRouteMeters } from '@/lib/field/distance-provider'
import { fuelPerKmSatang, initialCaseExpenseStatus } from '@/lib/field/expense-calc'
import {
  bangkokBusinessDate,
  ensureAgentPayeeId,
  FUEL_DISTANCE_JOB_TYPE,
  resolveRoundPricing,
  type ExpenseTxClient,
} from '@/lib/field/expense-queries'
import { Prisma } from '@/lib/generated/prisma/client'
import { drainNotificationOutboxSafely, enqueueNotificationOutbox } from '@/lib/notifications/outbox'
import { outboxExpenseApprovalEntries } from '@/lib/notifications/outbox-core'
import { prisma } from '@/lib/prisma'
import { isDirectEditRejected } from '@/lib/settings/period-lock'

/**
 * Job `fuel_distance_retry` (มติ PO 14/08/2569 — D10 · `91` §17)
 *
 * ปิดงานสำเร็จเสมอแม้ Google Maps ล่ม/quota หมด/ยังไม่ใส่ `GOOGLE_MAPS_API_KEY` — รายการ fuel
 * โหมด `PER_KM` จึงยังไม่เกิดตอนนั้น job นี้มาคำนวณระยะทางแล้วสร้างรายการให้ทีหลัง
 *
 * กติกา (`91` §17 — ทุก job ต้อง idempotent):
 * - claim งานด้วย conditional update (`pending` → `running`) ก่อนทำจริง — แพ้การแข่ง = ข้ามไปเงียบ ๆ
 * - **เขียนสถานะปิดงานต้องมีเงื่อนไข `running` เหมือนตอน claim** — Maps ค้างเกิน `reclaimStaleJobs()`
 *   จะดันงานกลับเป็น `pending` แล้ว instance อื่นหยิบไปทำ ⇒ ถ้าเขียนด้วย `where: { id }` เฉย ๆ
 *   instance เก่าที่ตื่นมาทีหลังจะทับสถานะของเจ้าของงานตัวจริง
 * - ก่อนสร้าง ตรวจซ้ำว่ารอบติดตามนั้นยังไม่มีรายการ fuel ที่มีผลอยู่ (partial unique ระดับ DB
 *   `uniq_active_case_expense_per_assignment` เป็นด่านสุดท้าย) — การตรวจอยู่นอกทรานแซกชันโดย
 *   ธรรมชาติ ⇒ ชนกันได้ P2002 ซึ่งแปลว่า "อีก instance สร้างให้แล้ว" = **สำเร็จ ไม่ใช่ล้ม**
 * - ยังคำนวณไม่ได้ = ปล่อยงานกลับเป็น `pending` + นับ retry (ไม่ทิ้งงาน ไม่สร้างยอด 0)
 * - ยอดที่คำนวณได้ = 0 ⇒ **ไม่สร้าง record** แล้วปิดงานนั้นเป็น `completed` (D10)
 */

export interface FuelDistanceJobOptions {
  limit?: number
  organizationId?: string
  /** id ของ job runner ที่สั่ง — ลง `reason` ของ audit เพื่อ trace (`90` §13) */
  jobId?: string
  now?: Date
}

export interface FuelDistanceJobResult {
  claimed: number
  created: number
  /** คำนวณได้แล้วแต่ยอดเป็น 0 ⇒ ไม่สร้าง record (DEC-006/D6) */
  skippedZero: number
  /** ยังคำนวณไม่ได้ — คืนคิวไว้รอบหน้า */
  deferred: number
  /**
   * วันปิดงานอยู่ในงวดบัญชีที่ปิดแล้ว ⇒ ไม่สร้างรายการเข้างวดนั้น (`13` §6.11 · มติ PO U25 — job ไม่ settle ข้ามงวด)
   * งานถูกปิดเป็น `failed` พร้อมเหตุผลให้เห็นใน Job Log (Final Test ด่าน 3)
   */
  periodLocked: number
  /** จำนวนแจ้งเตือนการเงิน/บัญชีของงานที่ลงงวดไม่ได้ (มติ PO U135) */
  periodLockedNotified: number
}

interface JobPayload {
  caseId?: unknown
  assignmentId?: unknown
}

/**
 * ปิด/คืนงานที่ **ตัวเองถือ claim อยู่เท่านั้น** — เงื่อนไข `running` คู่กับตอน claim
 * (ถ้างานถูก `reclaimStaleJobs()` ดันกลับ `pending` แล้ว instance อื่นหยิบไป จะเขียนไม่ติดโดยตั้งใจ)
 */
async function releaseJob(jobId: string, data: Prisma.JobUpdateManyMutationInput): Promise<void> {
  await prisma.job.updateMany({ where: { id: jobId, status: 'running' }, data })
}

export async function runFuelDistanceRetryJob(
  options: FuelDistanceJobOptions = {},
): Promise<FuelDistanceJobResult> {
  const now = options.now ?? new Date()
  const jobId = options.jobId ?? FUEL_DISTANCE_JOB_TYPE
  const result: FuelDistanceJobResult = {
    claimed: 0,
    created: 0,
    skippedZero: 0,
    deferred: 0,
    periodLocked: 0,
    periodLockedNotified: 0,
  }

  const due = await prisma.job.findMany({
    where: {
      jobType: FUEL_DISTANCE_JOB_TYPE,
      status: 'pending',
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? 50,
    select: { id: true, organizationId: true, payload: true, retryCount: true, maxRetries: true },
  })

  for (const job of due) {
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: 'pending' },
      data: { status: 'running', startedAt: now },
    })
    if (claimed.count === 0) continue
    result.claimed += 1

    const payload = job.payload as JobPayload
    const assignmentId = typeof payload.assignmentId === 'string' ? payload.assignmentId : null
    if (assignmentId === null || job.organizationId === null) {
      await releaseJob(job.id, {
        status: 'failed',
        errorMessage: 'payload ไม่มี assignmentId/organizationId',
        completedAt: now,
      })
      continue
    }

    try {
      const outcome = await createFuelExpense({
        jobId,
        sourceJobId: job.id,
        assignmentId,
        organizationId: job.organizationId,
        now,
      })
      if (outcome.kind === 'period_locked') {
        result.periodLocked += 1
        // มติ PO U135 — เก็บยอดที่คำนวณได้ใน `result` ให้การเงินกด "สร้างรายการเบิกย้อนหลัง" ลงงวดที่เปิด
        await releaseJob(job.id, {
          status: 'failed',
          errorMessage:
            'งวดบัญชีของวันปิดงานถูกปิดแล้ว — ไม่เขียนค่าน้ำมันเข้างวดนั้น ฝ่ายการเงินสร้างรายการเบิกย้อนหลังลงงวดที่เปิดอยู่ได้',
          completedAt: now,
          result: { outcome: 'period_locked', locked: { ...outcome.locked } },
        })
        result.periodLockedNotified += await notifyPeriodLockedFuel(job.organizationId, outcome.locked)
        continue
      }
      if (outcome.kind === 'created') result.created += 1
      if (outcome.kind === 'zero' || outcome.kind === 'skipped') result.skippedZero += 1
      await releaseJob(job.id, { status: 'completed', completedAt: now, result: { outcome: outcome.kind } })
    } catch (error) {
      // P2002 = `uniq_active_case_expense_per_assignment` ⇒ อีก instance สร้างรายการให้แล้ว
      // ⇒ ปิดเป็นสำเร็จ ไม่ใช่ `failed` (ไม่งั้นหน้า Job Log โชว์ล้มทั้งที่ค่าน้ำมันออกถูกต้อง)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        result.skippedZero += 1
        await releaseJob(job.id, { status: 'completed', completedAt: now, result: { outcome: 'skipped' } })
        continue
      }

      const retryable = error instanceof DistanceUnavailableError
      const exhausted = job.retryCount + 1 >= job.maxRetries
      result.deferred += retryable && !exhausted ? 1 : 0
      await releaseJob(job.id, {
        // ยังคำนวณไม่ได้ = กลับเข้าคิว (ปลายทางอาจกลับมาใน 10 นาที) — หมดโควตา retry จึงยอมแพ้
        status: retryable && !exhausted ? 'pending' : 'failed',
        retryCount: { increment: 1 },
        errorMessage: error instanceof Error ? error.message : 'คำนวณระยะทางไม่สำเร็จ',
        ...(retryable && !exhausted ? {} : { completedAt: now }),
      })
    }
  }

  // ส่งคิวแจ้งผู้อนุมัติท้ายรอบ (DEC-015) — ล้มไม่ทำให้รอบนี้ล้ม แถวค้างในคิวให้รอบ cron ถัดไป
  if (result.created > 0) {
    await drainNotificationOutboxSafely(
      options.organizationId === undefined ? {} : { organizationId: options.organizationId },
      FUEL_DISTANCE_JOB_TYPE,
    )
  }
  return result
}

/**
 * ยอดค่าน้ำมันที่คำนวณได้แล้วแต่ลงงวดของวันปิดงานไม่ได้ (งวดปิดแล้ว) — เก็บใน `jobs.result` ให้การเงินกด
 * "สร้างรายการเบิกย้อนหลัง" ได้โดยไม่ต้องเรียก Maps ซ้ำ (มติ PO U135 · ทางเดียวกับ U50)
 * ตัวเลขเป็นผลของ `fuelPerKmSatang()` ตามแผน (เวอร์ชัน) ของการปิดงานครั้งแรก — snapshot เมื่อเกิด (`92` §7.1)
 */
export interface LockedFuelSnapshot {
  caseId: string
  assignmentId: string
  agentId: string
  /** วันปิดงานเดิม (วันไทย `YYYY-MM-DD`) — งวดของวันนี้ปิดแล้ว */
  workDate: string
  distanceKmHundredths: number
  grossSatang: number
  planId: string
  planVersion: number
}

type FuelOutcome =
  | { kind: 'created' }
  | { kind: 'zero' }
  | { kind: 'skipped' }
  | { kind: 'period_locked'; locked: LockedFuelSnapshot }

/** ข้อมูลที่ต้องใช้คำนวณค่าน้ำมันของรอบที่ปิดงานแล้ว — `null` = รอบนี้ไม่ต้องมีรายการ fuel อีกต่อไป */
interface FuelBasis {
  assignmentId: string
  caseId: string
  agentId: string
  outcome: CaseOutcome
  plan: NonNullable<Awaited<ReturnType<typeof resolveRoundPricing>>['plan']>
  /** วันปิดงานครั้งแรกของรอบ (วันไทย) */
  workDate: Date
  origin: { latitude: number; longitude: number }
  checkins: { latitude: number; longitude: number; checkedInAt: Date }[]
}

async function loadFuelBasis(organizationId: string, assignmentId: string, now: Date): Promise<FuelBasis | null> {
  const assignment = await prisma.caseAssignment.findFirst({
    where: { id: assignmentId, organizationId },
    select: {
      id: true,
      caseId: true,
      agentId: true,
      status: true,
      completedAt: true,
      team: { select: { compensationPlan: { select: { id: true, fuelMode: true } } } },
      case: { select: { outcome: true } },
    },
  })
  // เคสถูกโอน/ตีกลับไปแล้ว หรือทีมไม่มีแผน = ไม่ต้องมีรายการ fuel ของรอบนี้อีกต่อไป
  if (assignment === null) return null
  if (assignment.status !== 'closed_success' && assignment.status !== 'closed_fail') return null
  const planId = assignment.team.compensationPlan?.id ?? null
  if (planId === null || assignment.team.compensationPlan?.fuelMode !== 'PER_KM') return null

  const existing = await prisma.expense.findFirst({
    where: { assignmentId: assignment.id, expenseType: 'fuel', status: { not: 'superseded' }, deletedAt: null },
    select: { id: true },
  })
  if (existing !== null) return null

  const [origin, checkins] = await Promise.all([
    prisma.travelOrigin.findUnique({
      where: { assignmentId: assignment.id },
      select: { latitude: true, longitude: true },
    }),
    prisma.checkIn.findMany({
      where: { assignmentId: assignment.id },
      orderBy: { checkedInAt: 'asc' },
      select: { latitude: true, longitude: true, checkedInAt: true },
    }),
  ])
  if (origin === null) return null

  // ฐานราคา = แผน (เวอร์ชัน) + วันปิดงานครั้งแรกของรอบนี้ — รอบที่ resubmit แล้วก็ยังยึดค่าเดิม
  // (มติ PO 03/10/2569 UAT Q7 · `41` §10.1) ไม่ใช่ `completed_at` ที่ขยับตามการส่งใหม่
  const pricing = await resolveRoundPricing(prisma as ExpenseTxClient, {
    organizationId,
    assignmentId: assignment.id,
    teamPlanId: planId,
  })
  if (pricing.plan === null) return null
  const closedAt = pricing.pricedAt ?? assignment.completedAt ?? now

  return {
    assignmentId: assignment.id,
    caseId: assignment.caseId,
    agentId: assignment.agentId,
    outcome: assignment.case.outcome ?? (assignment.status === 'closed_success' ? 'closed_success' : 'closed_fail'),
    plan: pricing.plan,
    workDate: bangkokBusinessDate(closedAt),
    origin: { latitude: origin.latitude.toNumber(), longitude: origin.longitude.toNumber() },
    checkins: checkins.map((row) => ({
      latitude: row.latitude.toNumber(),
      longitude: row.longitude.toNumber(),
      checkedInAt: row.checkedInAt,
    })),
  }
}

async function createFuelExpense(params: {
  jobId: string
  /** แถว `jobs` ของงานนี้ — ลงแถวคิวแจ้งเตือนเพื่อตามรอย (DEC-015) */
  sourceJobId: string
  assignmentId: string
  organizationId: string
  now: Date
}): Promise<FuelOutcome> {
  const basis = await loadFuelBasis(params.organizationId, params.assignmentId, params.now)
  if (basis === null) return { kind: 'skipped' }

  // โยน DistanceUnavailableError ออกไปให้ตัว job จัดการ retry (ยังไม่สร้างอะไรทั้งนั้น)
  const meters = await resolveRouteMeters(routePoints(basis.origin, basis.checkins))
  const distanceKmHundredths = metersToKmHundredths(meters)
  const grossSatang = fuelPerKmSatang({
    distanceKmHundredths,
    ratePerKmSatang: basis.plan.fuelRatePerKmSatang,
    maxPerCaseSatang: basis.plan.fuelMaxPerCaseSatang,
  })
  if (grossSatang <= 0) return { kind: 'zero' }

  // Period Lock (`13` §6.11 · non-negotiable 12) — รายการลงวันปิดงาน ถ้างวดนั้นปิดแล้ว (retry ข้ามสิ้นเดือน)
  // ห้ามเขียนตรงเข้างวด ⇒ เก็บยอดที่คำนวณได้ไว้ให้การเงินสร้างรายการเบิกย้อนหลังลงงวดที่เปิด (มติ PO U135)
  const periodStatus = await periodStatusAt(params.organizationId, periodKeyOf(basis.workDate))
  if (periodStatus !== null && isDirectEditRejected(periodStatus, true)) {
    return {
      kind: 'period_locked',
      locked: {
        caseId: basis.caseId,
        assignmentId: basis.assignmentId,
        agentId: basis.agentId,
        workDate: basis.workDate.toISOString().slice(0, 10),
        distanceKmHundredths,
        grossSatang,
        planId: basis.plan.planId,
        planVersion: basis.plan.version,
      },
    }
  }

  await persistFuelExpense({
    organizationId: params.organizationId,
    basis,
    distanceKmHundredths,
    grossSatang,
    expenseDate: basis.workDate,
    mode: { kind: 'job', jobId: params.jobId, sourceJobId: params.sourceJobId },
  })
  return { kind: 'created' }
}

type FuelPersistMode =
  | { kind: 'job'; jobId: string; sourceJobId: string }
  | { kind: 'backdated'; actor: SessionUser; meta: RequestMeta; reason: string }

/**
 * เขียนรายการ fuel `PER_KM` + audit + คิวแจ้งผู้อนุมัติ — ใช้ทั้ง job และ "สร้างรายการเบิกย้อนหลัง" (U135)
 * สถานะเริ่มต้น: ปิดไม่สำเร็จ = เข้าคิวอนุมัติ · ปิดสำเร็จ = รอคลัง **เว้น** ล็อตของเคสยืนยันแล้ว (เข้าคิวอนุมัติเลย)
 */
async function persistFuelExpense(params: {
  organizationId: string
  basis: Pick<FuelBasis, 'caseId' | 'assignmentId' | 'agentId' | 'outcome' | 'workDate'> & {
    plan: { planId: string; version: number }
  }
  distanceKmHundredths: number
  grossSatang: number
  expenseDate: Date
  mode: FuelPersistMode
}): Promise<string> {
  const { basis, mode } = params
  const assets = await prisma.asset.findMany({
    where: { caseId: basis.caseId, deletedAt: null },
    select: { lot: { select: { status: true } } },
  })
  const lotConfirmed = assets.length > 0 && assets.every((row) => row.lot?.status === 'confirmed')
  const status = lotConfirmed ? 'pending_approval' : initialCaseExpenseStatus(basis.outcome)
  const backdated = mode.kind === 'backdated' ? mode : null
  const workDateIso = basis.workDate.toISOString().slice(0, 10)

  return prisma.$transaction(async (tx) => {
    const payeeId = await ensureAgentPayeeId(tx as ExpenseTxClient, {
      organizationId: params.organizationId,
      userId: basis.agentId,
      actorId: backdated?.actor.id ?? basis.agentId,
    })

    const created = await tx.expense.create({
      data: {
        organizationId: params.organizationId,
        caseId: basis.caseId,
        assignmentId: basis.assignmentId,
        payeeId,
        expenseType: 'fuel',
        grossSatang: params.grossSatang,
        expenseDate: params.expenseDate,
        distanceKm: new Prisma.Decimal(kmHundredthsToDecimalString(params.distanceKmHundredths)),
        calculationSource: 'compensation_plan',
        compPlanId: basis.plan.planId,
        compPlanVersion: basis.plan.version,
        status,
        revisionNote:
          backdated === null ? null : `ลงงวดที่เปิดอยู่ — งานปิดเมื่อ ${fmtDate(basis.workDate)} (งวดนั้นปิดแล้ว)`,
        createdBy: backdated?.actor.id ?? basis.agentId,
      },
      select: { id: true },
    })

    await emitAudit(
      {
        organizationId: params.organizationId,
        // job: actor = ระบบ (`90` §13) ⇒ ต้องระบุ job id ใน reason · ย้อนหลัง: actor = ผู้กด + เหตุผลบังคับ
        actorId: backdated?.actor.id ?? null,
        actorRole: backdated?.actor.roleName ?? null,
        action: 'create',
        targetType: 'expenses',
        targetId: created.id,
        after: {
          caseId: basis.caseId,
          assignmentId: basis.assignmentId,
          expenseType: 'fuel',
          grossSatang: params.grossSatang,
          distanceKm: kmHundredthsToDecimalString(params.distanceKmHundredths),
          status,
          expenseDate: params.expenseDate.toISOString().slice(0, 10),
          ...(backdated === null ? {} : { workDate: workDateIso, backdated: true }),
          events: ['expense.case_bound_created'],
        },
        reason:
          backdated === null
            ? `[job:${mode.kind === 'job' ? mode.jobId : ''}] คำนวณระยะทางย้อนหลังสำเร็จ — สร้างรายการค่าน้ำมันที่ค้างจากตอนปิดงาน` // D10
            : `${backdated.reason} — สร้างรายการค่าน้ำมันย้อนหลังของงานที่ปิดเมื่อ ${fmtDate(basis.workDate)} (งวดของวันนั้นปิดแล้ว) ลงวันที่ ${fmtDate(params.expenseDate)}`,
        ...(backdated === null ? {} : { ipAddress: backdated.meta.ipAddress, userAgent: backdated.meta.userAgent }),
        diffOnly: false,
      },
      tx as ExpenseTxClient,
    )

    // มติ PO U29 — แถวที่เข้าคิวอนุมัติทันทีแจ้งผู้อนุมัติขั้น 1 · รอบสำเร็จยังรอคลัง = ตัวส่งข้ามเอง
    // เข้าคิวในทรานแซกชันเดียวกับการสร้างรายการ (DEC-015 · มติ PO U120) แล้วส่งท้ายรอบ
    await enqueueNotificationOutbox(tx, outboxExpenseApprovalEntries(params.organizationId, [created.id]), {
      jobType: FUEL_DISTANCE_JOB_TYPE,
      jobRef: mode.kind === 'job' ? mode.sourceJobId : `backdated:${basis.assignmentId}`,
    })
    return created.id
  })
}

/**
 * มติ PO U135 — แจ้ง**ทั้งการเงิน** (ผู้ถือ `create_adjustment` — กด "สร้างรายการเบิกย้อนหลัง") **และบัญชี**
 * (ผู้ถือ `manage_accounting_period`) แบบเดียวกับ U50 · คีย์กันซ้ำต่อรอบมอบหมาย (job ไม่ retry แต่สั่งซ้ำได้)
 */
async function notifyPeriodLockedFuel(organizationId: string, locked: LockedFuelSnapshot): Promise<number> {
  const [agent, caseRow] = await Promise.all([
    prisma.user.findFirst({ where: { id: locked.agentId, organizationId }, select: { fullName: true } }),
    prisma.case.findFirst({ where: { id: locked.caseId, organizationId }, select: { caseRef: true } }),
  ])
  const financeIds = await usersWithCapability(organizationId, CREATE_ADJUSTMENT, ORGANIZATION_SCOPE)
  const accountingIds = (await usersWithCapability(organizationId, MANAGE_ACCOUNTING_PERIOD, ORGANIZATION_SCOPE)).filter(
    (id) => !financeIds.includes(id),
  )
  const input = {
    assignmentId: locked.assignmentId,
    agentName: agent?.fullName ?? 'พนักงาน',
    caseRef: caseRow?.caseRef ?? '-',
    workDate: new Date(`${locked.workDate}T00:00:00.000Z`),
    grossSatang: locked.grossSatang,
  }
  const toFinance = await dispatchNotificationAwaited(
    { organizationId, userIds: financeIds },
    fuelPeriodLockedMessage(input, 'finance'),
  )
  const toAccounting =
    accountingIds.length === 0
      ? 0
      : await dispatchNotificationAwaited(
          { organizationId, userIds: accountingIds },
          fuelPeriodLockedMessage(input, 'accounting'),
        )
  return toFinance + toAccounting
}

// ── "สร้างรายการเบิกย้อนหลัง" ของค่าน้ำมันตามระยะทาง (มติ PO U135 · ทางเดียวกับ U50) ──────────────

export interface LockedFuelExpenseDto {
  /** แถว `jobs` ที่เก็บยอดไว้ — ส่งกลับมาตอนกดสร้าง */
  jobId: string
  assignmentId: string
  caseId: string
  caseRef: string
  agentName: string
  /** วันปิดงานเดิม `YYYY-MM-DD` (วันไทย — จอแปลงเป็น พ.ศ.) */
  workDate: string
  /** NUMERIC(10,2) เป็นข้อความ — ไม่ใช่เงิน */
  distanceKm: string
  grossSatang: number
}

export interface BackdatedFuelExpenseResult {
  /** `false` = รอบนี้มีรายการค่าน้ำมันแล้ว (กดซ้ำ/คนอื่นกดก่อน) — ไม่สร้างซ้ำ */
  created: boolean
  expenseId: string | null
  /** วันที่ลงรายการ (วันไทยในงวดที่เปิดอยู่) */
  expenseDate: string
}

function lockedSnapshotOf(result: unknown): LockedFuelSnapshot | null {
  if (typeof result !== 'object' || result === null) return null
  const record = result as Record<string, unknown>
  if (record['outcome'] !== 'period_locked') return null
  const locked = record['locked']
  if (typeof locked !== 'object' || locked === null) return null
  const value = locked as Record<string, unknown>
  const text = (key: string): string | null => (typeof value[key] === 'string' ? (value[key] as string) : null)
  const int = (key: string): number | null => (Number.isInteger(value[key]) ? (value[key] as number) : null)
  const caseId = text('caseId')
  const assignmentId = text('assignmentId')
  const agentId = text('agentId')
  const workDate = text('workDate')
  const planId = text('planId')
  const distanceKmHundredths = int('distanceKmHundredths')
  const grossSatang = int('grossSatang')
  const planVersion = int('planVersion')
  if (
    caseId === null ||
    assignmentId === null ||
    agentId === null ||
    workDate === null ||
    planId === null ||
    distanceKmHundredths === null ||
    grossSatang === null ||
    planVersion === null
  ) {
    return null
  }
  return { caseId, assignmentId, agentId, workDate, distanceKmHundredths, grossSatang, planId, planVersion }
}

const LOCKED_FUEL_LIST_LIMIT = 200

/** งานค่าน้ำมันที่ลงงวดของวันปิดงานไม่ได้และยังไม่มีรายการค่าน้ำมันของรอบนั้น (ระดับองค์กร — ยามสิทธิ์อยู่ที่ API) */
export async function listLockedFuelExpenses(user: SessionUser): Promise<LockedFuelExpenseDto[]> {
  const jobs = await prisma.job.findMany({
    where: {
      organizationId: user.organizationId,
      jobType: FUEL_DISTANCE_JOB_TYPE,
      status: 'failed',
      result: { path: ['outcome'], equals: 'period_locked' },
    },
    orderBy: { createdAt: 'asc' },
    take: LOCKED_FUEL_LIST_LIMIT,
    select: { id: true, result: true },
  })
  const snapshots = jobs.flatMap((job) => {
    const locked = lockedSnapshotOf(job.result)
    return locked === null ? [] : [{ jobId: job.id, locked }]
  })
  if (snapshots.length === 0) return []

  const assignmentIds = [...new Set(snapshots.map((row) => row.locked.assignmentId))]
  const [fuelRows, cases, agents] = await Promise.all([
    prisma.expense.findMany({
      where: {
        organizationId: user.organizationId,
        assignmentId: { in: assignmentIds },
        expenseType: 'fuel',
        status: { not: 'superseded' },
        deletedAt: null,
      },
      select: { assignmentId: true },
    }),
    prisma.case.findMany({
      where: { organizationId: user.organizationId, id: { in: snapshots.map((row) => row.locked.caseId) } },
      select: { id: true, caseRef: true },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, id: { in: snapshots.map((row) => row.locked.agentId) } },
      select: { id: true, fullName: true },
    }),
  ])
  const done = new Set(fuelRows.map((row) => row.assignmentId))
  const caseRefOf = new Map(cases.map((row) => [row.id, row.caseRef]))
  const nameOf = new Map(agents.map((row) => [row.id, row.fullName]))
  const seen = new Set<string>()
  const result: LockedFuelExpenseDto[] = []
  for (const { jobId, locked } of snapshots) {
    if (done.has(locked.assignmentId) || seen.has(locked.assignmentId)) continue
    seen.add(locked.assignmentId)
    result.push({
      jobId,
      assignmentId: locked.assignmentId,
      caseId: locked.caseId,
      caseRef: caseRefOf.get(locked.caseId) ?? '-',
      agentName: nameOf.get(locked.agentId) ?? 'พนักงาน',
      workDate: locked.workDate,
      distanceKm: kmHundredthsToDecimalString(locked.distanceKmHundredths),
      grossSatang: locked.grossSatang,
    })
  }
  return result
}

/**
 * สร้างรายการค่าน้ำมันย้อนหลังจากยอดที่ job คำนวณเก็บไว้ — ลงวันนี้ในงวดที่เปิดอยู่ · อ้างวันปิดงานเดิมในหมายเหตุ + audit
 * idempotent: รอบนี้มีรายการค่าน้ำมันแล้ว ⇒ `created: false` · สิทธิ์ `create_adjustment` (manage) ตรวจที่ API และที่นี่
 */
export async function createBackdatedFuelExpense(
  ctx: { actor: SessionUser; meta: RequestMeta },
  input: BackdatedFuelExpenseInput,
  now: Date = new Date(),
): Promise<BackdatedFuelExpenseResult> {
  const { actor } = ctx
  if (!hasCapability(actor, 'manage', CREATE_ADJUSTMENT)) {
    throw new AuthError('PERMISSION_DENIED', `capability=${CREATE_ADJUSTMENT} user=${actor.id}`)
  }
  const organizationId = actor.organizationId
  const expenseDate = bangkokBusinessDate(now)
  const expenseDateIso = expenseDate.toISOString().slice(0, 10)

  const job = await prisma.job.findFirst({
    where: { id: input.jobId, organizationId, jobType: FUEL_DISTANCE_JOB_TYPE },
    select: { result: true },
  })
  const locked = job === null ? null : lockedSnapshotOf(job.result)
  if (locked === null) throw new JobError('JOB_NOT_FOUND', { detail: `fuel job=${input.jobId}` })

  const existing = await prisma.expense.findFirst({
    where: {
      organizationId,
      assignmentId: locked.assignmentId,
      expenseType: 'fuel',
      status: { not: 'superseded' },
      deletedAt: null,
    },
    select: { id: true },
  })
  if (existing !== null) return { created: false, expenseId: existing.id, expenseDate: expenseDateIso }

  const assignment = await prisma.caseAssignment.findFirst({
    where: { id: locked.assignmentId, organizationId },
    select: { status: true, case: { select: { outcome: true } } },
  })
  if (assignment === null || (assignment.status !== 'closed_success' && assignment.status !== 'closed_fail')) {
    throw new JobError('JOB_INVALID_STATUS', { detail: `assignment=${locked.assignmentId} ไม่ได้ปิดงานแล้ว` })
  }

  const workDate = new Date(`${locked.workDate}T00:00:00.000Z`)
  // งวดของวันปิดงานเดิมยังเปิด (ถูกปลดล็อกภายหลัง) ⇒ ให้ job คำนวณลงวันเดิมตามปกติ
  const workPeriod = await periodStatusAt(organizationId, periodKeyOf(workDate))
  if (workPeriod === null || !isDirectEditRejected(workPeriod, true)) {
    throw new AccountingError('PERIOD_INVALID_STATUS', {
      detail: `งวดของวันปิดงาน ${locked.workDate} ยังไม่ปิด — ให้ job ค่าน้ำมันคำนวณตามปกติ`,
    })
  }
  // วันที่ลงรายการต้องอยู่ในงวดที่เปิดอยู่ (`13` §6.11) — งวดปัจจุบันปิดด้วย ⇒ PERIOD_LOCKED_DIRECT_EDIT
  await assertPeriodOpenAt({ organizationId, at: expenseDate, targetType: 'expenses' })

  const expenseId = await persistFuelExpense({
    organizationId,
    basis: {
      caseId: locked.caseId,
      assignmentId: locked.assignmentId,
      agentId: locked.agentId,
      outcome: assignment.case.outcome ?? (assignment.status === 'closed_success' ? 'closed_success' : 'closed_fail'),
      workDate,
      plan: { planId: locked.planId, version: locked.planVersion },
    },
    distanceKmHundredths: locked.distanceKmHundredths,
    grossSatang: locked.grossSatang,
    expenseDate,
    mode: { kind: 'backdated', actor, meta: ctx.meta, reason: input.reason },
  }).catch((error: unknown) => {
    // สองคนกดพร้อมกัน — `uniq_active_case_expense_per_assignment` กันแถวที่สอง ⇒ คืนแถวของผู้ชนะ
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
    throw error
  })
  if (expenseId === null) {
    const winner = await prisma.expense.findFirst({
      where: { organizationId, assignmentId: locked.assignmentId, expenseType: 'fuel', status: { not: 'superseded' } },
      select: { id: true },
    })
    return { created: false, expenseId: winner?.id ?? null, expenseDate: expenseDateIso }
  }
  await drainNotificationOutboxSafely({ organizationId }, FUEL_DISTANCE_JOB_TYPE)
  return { created: true, expenseId, expenseDate: expenseDateIso }
}

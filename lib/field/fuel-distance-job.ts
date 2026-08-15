import { emitAudit } from '@/lib/audit/audit'
import { kmHundredthsToDecimalString, metersToKmHundredths, routePoints } from '@/lib/field/distance'
import { DistanceUnavailableError, resolveRouteMeters } from '@/lib/field/distance-provider'
import { fuelPerKmSatang, initialCaseExpenseStatus } from '@/lib/field/expense-calc'
import {
  bangkokBusinessDate,
  ensureAgentPayeeId,
  FUEL_DISTANCE_JOB_TYPE,
  resolvePlanSnapshot,
  type ExpenseTxClient,
} from '@/lib/field/expense-queries'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

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
  const result: FuelDistanceJobResult = { claimed: 0, created: 0, skippedZero: 0, deferred: 0 }

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
      const outcome = await createFuelExpense({ jobId, assignmentId, organizationId: job.organizationId, now })
      if (outcome === 'created') result.created += 1
      if (outcome === 'zero' || outcome === 'skipped') result.skippedZero += 1
      await releaseJob(job.id, { status: 'completed', completedAt: now, result: { outcome } })
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

  return result
}

type FuelOutcome = 'created' | 'zero' | 'skipped'

async function createFuelExpense(params: {
  jobId: string
  assignmentId: string
  organizationId: string
  now: Date
}): Promise<FuelOutcome> {
  const assignment = await prisma.caseAssignment.findFirst({
    where: { id: params.assignmentId, organizationId: params.organizationId },
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
  if (assignment === null) return 'skipped'
  if (assignment.status !== 'closed_success' && assignment.status !== 'closed_fail') return 'skipped'
  const planId = assignment.team.compensationPlan?.id ?? null
  if (planId === null || assignment.team.compensationPlan?.fuelMode !== 'PER_KM') return 'skipped'

  const existing = await prisma.expense.findFirst({
    where: {
      assignmentId: assignment.id,
      expenseType: 'fuel',
      status: { not: 'superseded' },
      deletedAt: null,
    },
    select: { id: true },
  })
  if (existing !== null) return 'skipped'

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
  if (origin === null) return 'skipped'

  const closedAt = assignment.completedAt ?? params.now
  const plan = await resolvePlanSnapshot(prisma as ExpenseTxClient, {
    organizationId: params.organizationId,
    planId,
    onDate: closedAt,
  })
  if (plan === null) return 'skipped'

  // โยน DistanceUnavailableError ออกไปให้ตัว job จัดการ retry (ยังไม่สร้างอะไรทั้งนั้น)
  const meters = await resolveRouteMeters(
    routePoints(
      { latitude: origin.latitude.toNumber(), longitude: origin.longitude.toNumber() },
      checkins.map((row) => ({
        latitude: row.latitude.toNumber(),
        longitude: row.longitude.toNumber(),
        checkedInAt: row.checkedInAt,
      })),
    ),
  )

  const distanceKmHundredths = metersToKmHundredths(meters)
  const grossSatang = fuelPerKmSatang({
    distanceKmHundredths,
    ratePerKmSatang: plan.fuelRatePerKmSatang,
    maxPerCaseSatang: plan.fuelMaxPerCaseSatang,
  })
  if (grossSatang <= 0) return 'zero'

  const outcome = assignment.case.outcome ?? (assignment.status === 'closed_success' ? 'closed_success' : 'closed_fail')
  const status = initialCaseExpenseStatus(outcome)

  await prisma.$transaction(async (tx) => {
    const payeeId = await ensureAgentPayeeId(tx as ExpenseTxClient, {
      organizationId: params.organizationId,
      userId: assignment.agentId,
      actorId: assignment.agentId,
    })

    const created = await tx.expense.create({
      data: {
        organizationId: params.organizationId,
        caseId: assignment.caseId,
        assignmentId: assignment.id,
        payeeId,
        expenseType: 'fuel',
        grossSatang,
        expenseDate: bangkokBusinessDate(closedAt),
        distanceKm: new Prisma.Decimal(kmHundredthsToDecimalString(distanceKmHundredths)),
        calculationSource: 'compensation_plan',
        compPlanId: plan.planId,
        compPlanVersion: plan.version,
        status,
        createdBy: assignment.agentId,
      },
      select: { id: true },
    })

    await emitAudit(
      {
        organizationId: params.organizationId,
        // actor = ระบบ (`90` §13) ⇒ ต้องระบุ job id ใน reason
        actorId: null,
        actorRole: null,
        action: 'create',
        targetType: 'expenses',
        targetId: created.id,
        after: {
          caseId: assignment.caseId,
          assignmentId: assignment.id,
          expenseType: 'fuel',
          grossSatang,
          distanceKm: kmHundredthsToDecimalString(distanceKmHundredths),
          status,
          events: ['expense.case_bound_created'],
        },
        reason: `[job:${params.jobId}] คำนวณระยะทางย้อนหลังสำเร็จ — สร้างรายการค่าน้ำมันที่ค้างจากตอนปิดงาน (D10)`,
        diffOnly: false,
      },
      tx as ExpenseTxClient,
    )
  })

  return 'created'
}

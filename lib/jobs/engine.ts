import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import type { JobStatus } from '@/lib/generated/prisma/enums'
import { JOB_MAX_RETRIES_DEFAULT, nextAttemptAfterFailure } from '@/lib/jobs/job-state'
import {
  JOB_TYPE_SPECS,
  SCHEDULED_JOB_TYPES,
  isKnownJobType,
  jobTypeLabel,
  scheduledIdempotencyKey,
  type JobTypeCode,
} from '@/lib/jobs/job-types'
import { JOB_HANDLERS, SWEEPER_JOB_TYPES, type JobHandlerResult } from '@/lib/jobs/registry'
import type { JobRunSummaryDto } from '@/lib/jobs/types'
import { prisma } from '@/lib/prisma'

/**
 * ตัวรันงานเบื้องหลังกลาง (`91` §6.2/§9/§10/§17) — **ทางเดียว**ที่ job ถูกสร้างและถูกรัน
 *
 * ### idempotency (`01` §11 · `91` §14)
 * คีย์กันซ้ำเก็บอยู่ใน `payload.idempotencyKey` **ไม่ใช่คอลัมน์ใหม่** — `02` §10 กำหนดรูปตาราง
 * `jobs` ไว้แล้วและ Rule 02 ห้ามแก้ schema ให้ต่างจาก `02` เงียบ ๆ · ตัวบังคับความไม่ซ้ำจริงคือ
 * partial unique index `uniq_jobs_org_idempotency_key` บน
 * `(COALESCE(organization_id::text,'system'), payload->>'idempotencyKey')`
 * (`prisma/migrations/20260815203000_jobs_idempotency_key_per_org`) ⇒ สองคำขอพร้อมกันด้วยคีย์เดียวกัน
 * ตัวที่แพ้ได้ P2002 แล้วอ่าน job เดิมกลับมาคืน — ไม่มีทางเกิด job ซ้ำแม้แข่งกันระดับมิลลิวินาที
 * · ขอบเขตของคีย์คือ **ต่อองค์กร** — คีย์ที่ผู้เรียกส่งมาเองห้ามชนกันข้ามองค์กร (multi-tenant)
 *
 * ### กันงานซ้อน (`91` §10 — retry ห้ามสร้างผลซ้ำ)
 * หยิบงานด้วย **conditional update** (`updateMany` + `where status: 'pending'`) เสมอ — ตัวรันงาน
 * สองตัวยิงพร้อมกัน ตัวที่แพ้ได้ `count = 0` แล้วข้ามไปเงียบ ๆ (ไม่ใช่ error)
 *
 * ### audit (`90` §13 · `91` §13)
 * บันทึกตอน **สร้าง** และตอน **จบรอบ** (สำเร็จ/ล้มเหลว/เข้าคิวใหม่) — ช่วง `pending → running`
 * เป็นสถานะชั่วคราวที่ไม่มีข้อมูลธุรกิจเปลี่ยน จึงไม่บันทึกซ้ำ (กัน audit ท่วมโดยไม่ได้ประโยชน์)
 * actor ของตัวตั้งเวลา = ระบบ (`actor_id = NULL`) ⇒ `reason` ต้องระบุ job id เสมอ
 */

/** คีย์สงวนใน `payload` — ห้าม handler ตัวไหนใช้ชื่อนี้เป็นข้อมูลธุรกิจ */
export const JOB_IDEMPOTENCY_PAYLOAD_KEY = 'idempotencyKey'

const JOB_TARGET_TYPE = 'jobs'

export interface JobRow {
  id: string
  organizationId: string | null
  jobType: string
  status: JobStatus
  payload: Prisma.JsonValue
  result: Prisma.JsonValue | null
  errorMessage: string | null
  retryCount: number
  maxRetries: number
  scheduledAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  createdBy: string | null
}

export const JOB_SELECT = {
  id: true,
  organizationId: true,
  jobType: true,
  status: true,
  payload: true,
  result: true,
  errorMessage: true,
  retryCount: true,
  maxRetries: true,
  scheduledAt: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  createdBy: true,
} satisfies Prisma.JobSelect

export interface EnqueueJobInput {
  /** `null` = งานระดับระบบที่ทำข้ามทุกองค์กร (`02` §10 อนุญาตให้ว่างได้) */
  organizationId: string | null
  jobType: JobTypeCode
  payload?: Record<string, unknown>
  /** คีย์กันซ้ำ (`91` §14 — บังคับ) */
  idempotencyKey: string
  scheduledAt?: Date | null
  maxRetries?: number
  /** ผู้สั่งงาน — `null` = ตัวตั้งเวลาของระบบ */
  createdBy?: string | null
  actorRole?: string | null
  /** เหตุผลลง audit — ผู้สั่งเป็นระบบต้องระบุที่มาเสมอ (`90` §13) */
  reason?: string
}

export interface EnqueueJobResult {
  job: JobRow
  /** `true` = คีย์กันซ้ำตรงกับงานเดิม จึงคืนงานเดิม ไม่สร้างใหม่ (`91` §11) */
  duplicate: boolean
}

function payloadWithKey(payload: Record<string, unknown> | undefined, key: string): Prisma.InputJsonValue {
  return { ...(payload ?? {}), [JOB_IDEMPOTENCY_PAYLOAD_KEY]: key } as Prisma.InputJsonValue
}

/**
 * คีย์กันซ้ำมีผล **ภายในองค์กรเดียวกันเท่านั้น** — `POST /api/jobs` รับคีย์จากผู้เรียกตรง ๆ
 * ถ้าค้นข้ามองค์กร องค์กร B ที่ใช้คีย์ซ้ำกับ A จะได้ job ของ A กลับไป (งานของ B หาย + ข้อมูลรั่ว)
 * งานระดับระบบ (`organization_id IS NULL`) กันซ้ำกันเองในกลุ่มเดียว
 */
async function findByIdempotencyKey(organizationId: string | null, key: string): Promise<JobRow | null> {
  // เทียบด้วยรูปเดียวกับ expression ของ `uniq_jobs_org_idempotency_key` เป๊ะ ๆ เพื่อให้เข้า index
  // (`payload: { path, equals }` ของ Prisma เทียบแบบ jsonb ⇒ ไม่เข้า index ตัวนี้ = seq scan ทุกครั้ง)
  const [row] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM jobs
     WHERE COALESCE(organization_id::text, 'system') = ${organizationId ?? 'system'}
       AND payload->>'idempotencyKey' = ${key}
     LIMIT 1
  `
  if (row === undefined) return null
  return prisma.job.findUnique({ where: { id: row.id }, select: JOB_SELECT })
}

/**
 * สร้างงานใหม่ — คีย์ซ้ำ = คืนงานเดิม (`91` §11 `JOB_DUPLICATE`) **ไม่ใช่ error**
 * ⇒ ผู้เรียกทุกทาง (API / dev trigger / ตัวตั้งเวลา / โมดูลอื่น) ต้องผ่านฟังก์ชันนี้เท่านั้น
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<EnqueueJobResult> {
  const existing = await findByIdempotencyKey(input.organizationId, input.idempotencyKey)
  if (existing !== null) return { job: existing, duplicate: true }

  try {
    const job = await prisma.job.create({
      data: {
        organizationId: input.organizationId,
        jobType: input.jobType,
        status: 'pending',
        payload: payloadWithKey(input.payload, input.idempotencyKey),
        maxRetries: input.maxRetries ?? JOB_MAX_RETRIES_DEFAULT,
        scheduledAt: input.scheduledAt ?? null,
        createdBy: input.createdBy ?? null,
      },
      select: JOB_SELECT,
    })

    // งานระดับระบบไม่มี organization_id แต่ audit ต้องมีเสมอ — ใช้องค์กรของงานถ้ามี
    if (job.organizationId !== null) {
      await emitAudit({
        organizationId: job.organizationId,
        actorId: input.createdBy ?? null,
        actorRole: input.actorRole ?? null,
        action: 'create',
        targetType: JOB_TARGET_TYPE,
        targetId: job.id,
        after: { jobType: job.jobType, payload: job.payload, scheduledAt: job.scheduledAt },
        reason:
          input.reason ??
          `ตั้งงานเบื้องหลัง "${jobTypeLabel(job.jobType)}" (job id ${job.id} · คีย์กันซ้ำ ${input.idempotencyKey})`,
      })
    }

    return { job, duplicate: false }
  } catch (error) {
    // แข่งกันสร้างด้วยคีย์เดียวกัน — ตัวที่แพ้ partial unique index อ่านของเดิมกลับมาคืน
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await findByIdempotencyKey(input.organizationId, input.idempotencyKey)
      if (raced !== null) return { job: raced, duplicate: true }
    }
    throw error
  }
}

export interface RunJobsOptions {
  now?: Date
  /** จำนวนงานสูงสุดต่อรอบ — กันรอบเดียวกินเวลายาวเกิน timeout ของ Vercel */
  limit?: number
  organizationId?: string
  jobTypes?: readonly JobTypeCode[]
}

export type JobRunTally = Omit<JobRunSummaryDto, 'enqueued' | 'duplicated'>

const EMPTY_TALLY: JobRunTally = {
  picked: 0,
  completed: 0,
  retryScheduled: 0,
  deadLettered: 0,
  skipped: 0,
}

/** ผลของงานหนึ่งตัว — ใช้ทั้งใน `runDueJobs()` และตอน dev trigger รันทันที */
export type JobOutcome = 'completed' | 'retry_scheduled' | 'dead_letter' | 'skipped'

/**
 * รันงานที่ถึงคิว — งานที่ `pending` และ `scheduled_at` ว่างหรือถึงเวลาแล้ว
 * เรียกซ้ำได้ตลอด (idempotent): งานที่ถูกหยิบไปแล้วจะไม่ถูกหยิบซ้ำเพราะสถานะเปลี่ยนเป็น `running`
 */
export async function runDueJobs(options: RunJobsOptions = {}): Promise<JobRunTally> {
  const now = options.now ?? new Date()
  const due = await prisma.job.findMany({
    where: {
      status: 'pending',
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
      // job_type ที่ดูแลคิวของตัวเอง (`fuel_distance_retry`) ถูกกวาดโดย handler ของมันเอง —
      // ถ้าหยิบมารันที่นี่ด้วยจะกลายเป็น claim สองชั้นทับกัน (ดู `lib/jobs/registry.ts`)
      jobType: options.jobTypes === undefined ? { notIn: [...SWEEPER_JOB_TYPES] } : { in: [...options.jobTypes] },
    },
    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    take: options.limit ?? 25,
    select: JOB_SELECT,
  })

  const tally: JobRunTally = { ...EMPTY_TALLY }
  for (const job of due) {
    const outcome = await runJob(job, now)
    if (outcome === 'skipped') tally.skipped += 1
    else {
      tally.picked += 1
      if (outcome === 'completed') tally.completed += 1
      if (outcome === 'retry_scheduled') tally.retryScheduled += 1
      if (outcome === 'dead_letter') tally.deadLettered += 1
    }
  }
  return tally
}

/**
 * เวลาที่ปล่อยให้งานหนึ่งตัวค้างสถานะ `running` ได้ก่อนถือว่าตัวรันงานตายไปแล้ว
 * ต้องมากกว่า `maxDuration` ของ route ตัวตั้งเวลา (300 วิ) พอสมควร — ไม่งั้นจะไปแย่งงานที่ยังทำอยู่จริง
 */
export const JOB_STALE_RUNNING_MS = 15 * 60 * 1000

/**
 * กู้งานที่ค้าง `running` (`91` §10) — instance ของ Vercel ถูกตัดกลางคัน/ถูก freeze ระหว่างทำงาน
 * งานนั้นจะไม่ถูกหยิบซ้ำ (`where status: 'pending'`), retry มือก็ไม่ได้ (`canManualRetry()` ปฏิเสธ
 * `running`) และคีย์กันซ้ำถูกจองไปแล้ว ⇒ **ตันทุกทาง** ถ้าไม่มีตัวกวาด
 *
 * นับเป็น "ล้มเหลวหนึ่งครั้ง" ตามบันไดเดิม เพื่อให้ครบเพดานแล้วตกเป็น dead letter จริง
 * (ถ้าดันกลับเป็น `pending` เฉย ๆ งานที่ค้างทุกรอบจะวนไม่รู้จบ)
 */
export async function reclaimStaleJobs(
  now: Date = new Date(),
  staleAfterMs: number = JOB_STALE_RUNNING_MS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - staleAfterMs)
  const stale = await prisma.job.findMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    select: JOB_SELECT,
  })

  for (const job of stale) {
    // กันแย่งกับตัวกวาดอีกตัว — ใครเปลี่ยนสถานะออกจาก `running` ได้ก่อนเป็นคนจัดการ
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: 'running', startedAt: { lt: cutoff } },
      data: { status: 'pending' },
    })
    if (claimed.count === 0) continue
    await failJob(job, now, `งานค้างสถานะ "กำลังทำ" เกิน ${Math.round(staleAfterMs / 60000)} นาที — ตัวรันงานหยุดกลางคัน`, false)
  }

  return stale.length
}

/**
 * รันงานตาม id — ใช้กับ dev trigger (`91` §14.1) ที่ต้องเห็นผลทันทีโดยไม่รอรอบเวลา
 * คืน `skipped` เมื่องานไม่อยู่ในสถานะ `pending` แล้ว (ถูกตัวรันงานอื่นหยิบไปก่อน)
 */
export async function runJobById(id: string, now: Date = new Date()): Promise<JobOutcome> {
  const job = await prisma.job.findUnique({ where: { id }, select: JOB_SELECT })
  if (job === null || job.status !== 'pending') return 'skipped'
  return runJob(job, now)
}

/**
 * รันงานหนึ่งตัวจนจบ — คืน `skipped` เมื่อแพ้การแข่งหยิบงาน (ตัวรันอื่นเอาไปทำแล้ว)
 * ⚠️ ตัว handler เป็นคนดูแล side effect ของตัวเองให้ idempotent (`91` §10) — ที่นี่คุมแค่สถานะ/retry
 */
export async function runJob(job: JobRow, now: Date = new Date()): Promise<JobOutcome> {
  const claimed = await prisma.job.updateMany({
    where: { id: job.id, status: 'pending' },
    data: { status: 'running', startedAt: now, errorMessage: null },
  })
  if (claimed.count === 0) return 'skipped'

  try {
    const handler = isKnownJobType(job.jobType) ? JOB_HANDLERS[job.jobType] : undefined
    if (handler === undefined) {
      // job_type ที่ไม่มี handler = ปัญหาการตั้งค่า ไม่ใช่ error ชั่วคราว ⇒ ไม่ retry ให้เสียรอบ
      return await failJob(job, now, `ไม่รู้จัก job_type "${job.jobType}" — ไม่มี handler ในทะเบียน`, true)
    }
    const result = await handler({ job, now })
    return await completeJob(job, now, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ทำงานไม่สำเร็จ (ไม่ทราบสาเหตุ)'
    return await failJob(job, now, message, false)
  }
}

async function completeJob(job: JobRow, now: Date, result: JobHandlerResult): Promise<JobOutcome> {
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      status: 'completed',
      completedAt: now,
      errorMessage: null,
      result: (result ?? {}) as Prisma.InputJsonValue,
    },
    select: JOB_SELECT,
  })
  await auditJobOutcome(updated, job, 'ทำงานสำเร็จ')
  return 'completed'
}

async function failJob(job: JobRow, now: Date, message: string, terminal: boolean): Promise<JobOutcome> {
  const next = terminal
    ? { status: 'failed' as const, retryCount: job.maxRetries, scheduledAt: null, deadLetter: true }
    : nextAttemptAfterFailure(job, now)

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      status: next.status,
      retryCount: next.retryCount,
      scheduledAt: next.scheduledAt,
      errorMessage: message,
      completedAt: next.deadLetter ? now : null,
    },
    select: JOB_SELECT,
  })

  await auditJobOutcome(
    updated,
    job,
    next.deadLetter
      ? `ล้มเหลวถาวรหลัง retry ครบ ${updated.retryCount}/${updated.maxRetries} ครั้ง`
      : `ล้มเหลวครั้งที่ ${updated.retryCount} — เข้าคิวใหม่`,
  )
  return next.deadLetter ? 'dead_letter' : 'retry_scheduled'
}

async function auditJobOutcome(after: JobRow, before: JobRow, headline: string): Promise<void> {
  if (after.organizationId === null) return
  await emitAudit({
    organizationId: after.organizationId,
    // ตัวรันงาน = ระบบเสมอ (ผู้สั่งงานเดิมอยู่ที่ `jobs.created_by` แล้ว) ⇒ reason ต้องมี job id
    actorId: null,
    actorRole: null,
    action: 'status_change',
    targetType: JOB_TARGET_TYPE,
    targetId: after.id,
    before: { status: before.status, retryCount: before.retryCount },
    after: {
      status: after.status,
      retryCount: after.retryCount,
      errorMessage: after.errorMessage,
      result: after.result,
    },
    reason: `งานเบื้องหลัง "${jobTypeLabel(after.jobType)}" ${headline} (job id ${after.id})`,
  })
}

export interface ScheduleTickResult {
  enqueued: number
  duplicated: number
}

/**
 * ตั้งคิวงานตามตารางเวลาให้ครบหนึ่ง "ช่องเวลา" (`91` §17 — รันผ่าน Vercel Cron/QStash ตาม DEC-001)
 *
 * คีย์กันซ้ำ = `cron:<job_type>:<ช่องเวลา>` ⇒ cron ยิงซ้ำในช่องเดิม (retry ของ Vercel/QStash,
 * กดปุ่มซ้ำ) ได้ job ตัวเดิมเสมอ ไม่เกิดงานซ้อน
 */
export async function enqueueScheduledJobs(now: Date = new Date()): Promise<ScheduleTickResult> {
  const result: ScheduleTickResult = { enqueued: 0, duplicated: 0 }

  for (const code of SCHEDULED_JOB_TYPES) {
    const key = scheduledIdempotencyKey(code, now)
    if (key === null) continue
    const { duplicate } = await enqueueJob({
      // งานตามตารางเวลาทำข้ามทุกองค์กรในรอบเดียว (handler รับ `organizationId` ว่าง = ทั้งระบบ)
      organizationId: null,
      jobType: code,
      idempotencyKey: key,
      payload: { source: 'cron', schedule: JOB_TYPE_SPECS[code].schedule },
    })
    if (duplicate) result.duplicated += 1
    else result.enqueued += 1
  }

  return result
}

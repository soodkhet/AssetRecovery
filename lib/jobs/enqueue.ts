import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import type { JobStatus } from '@/lib/generated/prisma/enums'
import { JOB_MAX_RETRIES_DEFAULT } from '@/lib/jobs/job-state'
import { jobTypeLabel, type JobTypeCode } from '@/lib/jobs/job-types'
import { prisma } from '@/lib/prisma'

/**
 * สร้างงานเบื้องหลัง (`91` §11/§14) — แยกจาก `lib/jobs/engine.ts` (ตัวรันงาน) เพราะตัวรันงาน import ทะเบียน handler
 * ซึ่ง import โมดูลธุรกิจ ⇒ โมดูลธุรกิจที่ต้อง "ตั้งงาน" import ไฟล์นี้แทน ไม่เกิด import วน (staging S-008)
 * กติกา idempotency / audit ดูหัวไฟล์ `lib/jobs/engine.ts`
 */

/** ผลของการรันงานหนึ่งตัว — ใช้ร่วมกับผู้ที่ถูกฉีดตัวรันงานเข้าไป (เช่นตัวกวาดรอบจ่าย) */
export type JobOutcome = 'completed' | 'retry_scheduled' | 'dead_letter' | 'skipped'

/** ตัวรันงานรายตัว (`runJobById` ของ engine) — ฉีดเข้าโมดูลที่ถูกทะเบียน handler import ไว้ (กัน import วน) */
export type RunJobById = (id: string, now?: Date) => Promise<JobOutcome>

/** คีย์สงวนใน `payload` — ห้าม handler ตัวไหนใช้ชื่อนี้เป็นข้อมูลธุรกิจ */
export const JOB_IDEMPOTENCY_PAYLOAD_KEY = 'idempotencyKey'

export const JOB_TARGET_TYPE = 'jobs'

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

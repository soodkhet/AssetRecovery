import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import type { Prisma } from '@/lib/generated/prisma/client'
import { JOB_SELECT, enqueueJob, type JobRow } from '@/lib/jobs/engine'
import { JobError } from '@/lib/jobs/errors'
import { canManualRetry, jobViewStatus, type JobViewStatus } from '@/lib/jobs/job-state'
import { jobTypeLabel } from '@/lib/jobs/job-types'
import type { JobCreateInput, JobListQuery, JobRetryInput } from '@/lib/jobs/schemas'
import type { JobCreateResultDto, JobDetailDto, JobListDto, JobListItemDto, JobOutputDto } from '@/lib/jobs/types'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของงานเบื้องหลัง (`91` §8/§12/§14) — Phase 5.3
 *
 * กติกาที่บังคับที่นี่:
 * - กรอง `organization_id` ของผู้เรียกเสมอ **บวกงานระดับระบบ** (`organization_id IS NULL` —
 *   `02` §10 อนุญาตให้ว่างได้สำหรับงานที่ตัวตั้งเวลาสั่งข้ามองค์กร) — Rule 02
 * - **Company User เข้าไม่ได้เด็ดขาด**: payload/result ของงานมีข้อมูลข้ามบริษัท (รอบจ่าย/ชุดบัญชี)
 *   และแถว `jobs` ไม่มีคอลัมน์บริษัทให้กรองรายแถว ⇒ 403 ตั้งแต่ต้นทาง (`97` §11 ห้าม leak)
 * - **retry = Superadmin เท่านั้น + ต้องมีเหตุผล** (`91` §12/§14) — ตรวจที่นี่อีกชั้นนอกจาก
 *   `requirePermission()` ที่ route (DEC-002)
 * - ไฟล์ผลลัพธ์ **ไม่ถูกเสิร์ฟจากโมดูลนี้** — ชี้ไปที่ endpoint ดาวน์โหลดของโมดูลเจ้าของไฟล์
 *   (`37`/`17`) ซึ่งตรวจสิทธิ์ของตัวเองทุกครั้ง ⇒ ไม่มีทางลัดที่ข้ามสิทธิ์ผ่านหน้า Job Log
 */

function assertJobsReadable(user: SessionUser): void {
  if (user.scope.kind === 'company') {
    throw new AuthError('PERMISSION_DENIED', `jobs: company scope user=${user.id}`)
  }
}

/** `91` §12 — สั่งทำงานใหม่ได้เฉพาะ Superadmin (role อื่นที่ถือ `manage` ก็ไม่ได้) */
function assertJobRetryAllowed(user: SessionUser): void {
  if (!user.isSuperadmin) {
    throw new AuthError('PERMISSION_DENIED', `jobs.retry: ต้องเป็น Superadmin (user=${user.id})`)
  }
}

function bangkokDayStart(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000+07:00`)
}

function bangkokDayEnd(dateOnly: string): Date {
  return new Date(`${dateOnly}T23:59:59.999+07:00`)
}

/**
 * ตัวกรองสถานะบนหน้าจอ → เงื่อนไขจริง
 * `dead_letter` / `failed` ต้องแยกกันด้วยการเทียบ `retry_count` กับ `max_retries` เพราะ
 * dead letter เป็นสถานะที่ derive มา ไม่ใช่ค่าใน enum (`91` §6.2)
 */
function statusWhere(status: JobViewStatus | undefined): Prisma.JobWhereInput {
  if (status === undefined) return {}
  if (status === 'dead_letter') {
    return { status: 'failed', retryCount: { gte: prisma.job.fields.maxRetries } }
  }
  if (status === 'failed') {
    return { status: 'failed', retryCount: { lt: prisma.job.fields.maxRetries } }
  }
  return { status }
}

export function jobListWhere(user: SessionUser, query: JobListQuery): Prisma.JobWhereInput {
  const createdAt: Prisma.DateTimeFilter = {}
  if (query.dateFrom !== undefined) createdAt.gte = bangkokDayStart(query.dateFrom)
  if (query.dateTo !== undefined) createdAt.lte = bangkokDayEnd(query.dateTo)

  return {
    OR: [{ organizationId: user.organizationId }, { organizationId: null }],
    ...(query.jobType === undefined ? {} : { jobType: query.jobType }),
    ...statusWhere(query.status),
    ...(createdAt.gte === undefined && createdAt.lte === undefined ? {} : { createdAt }),
  }
}

type JobWithActor = JobRow & { createdByUser: { fullName: string } | null }

const listSelect = { ...JOB_SELECT, createdByUser: { select: { fullName: true } } } satisfies Prisma.JobSelect

function toListItem(row: JobWithActor): JobListItemDto {
  return {
    id: row.id,
    jobType: row.jobType,
    jobTypeLabel: jobTypeLabel(row.jobType),
    status: jobViewStatus(row),
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    createdAt: row.createdAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    createdById: row.createdBy,
    createdByName: row.createdByUser?.fullName ?? null,
  }
}

function stringField(source: Prisma.JsonValue | null, key: string): string | null {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function numberField(source: Prisma.JsonValue | null, key: string): number | null {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : null
}

/**
 * ไฟล์ผลลัพธ์ของงาน (`91` §8 "Download output" · §10 versioned + hash)
 * — ชี้ไปที่ endpoint ของโมดูลเจ้าของไฟล์เสมอ ไม่ทำตัวเสิร์ฟไฟล์ซ้อนอีกชุด
 */
export function jobOutput(row: JobRow): JobOutputDto | null {
  if (row.status !== 'completed') return null

  if (row.jobType === 'export_pack') {
    const exportRecordId = stringField(row.result, 'exportRecordId')
    if (exportRecordId === null) return null
    return {
      label: 'ชุดข้อมูลบัญชี (.zip)',
      href: `/api/accounting/export-history/${exportRecordId}/download`,
      fileName: stringField(row.result, 'fileName'),
      fileHash: stringField(row.result, 'fileHash'),
      version: numberField(row.result, 'version'),
    }
  }

  if (row.jobType === 'bank_file') {
    const batchId = stringField(row.result, 'batchId')
    if (batchId === null) return null
    return {
      label: 'ไฟล์โอนเงิน',
      href: `/api/payout-batches/${batchId}/payment-file`,
      fileName: stringField(row.result, 'fileName'),
      fileHash: stringField(row.result, 'fileHash'),
      version: null,
    }
  }

  return null
}

function toDetail(row: JobWithActor): JobDetailDto {
  return {
    ...toListItem(row),
    payload: row.payload,
    result: row.result,
    output: jobOutput(row),
  }
}

export async function listJobs(user: SessionUser, query: JobListQuery): Promise<JobListDto> {
  assertJobsReadable(user)
  const where = jobListWhere(user, query)

  const [rows, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      select: listSelect,
    }),
    prisma.job.count({ where }),
  ])

  return {
    items: rows.map(toListItem),
    total,
    offset: query.offset,
    limit: query.limit,
    hasMore: query.offset + rows.length < total,
  }
}

async function findJobRow(user: SessionUser, id: string): Promise<JobWithActor> {
  const row = await prisma.job.findFirst({
    where: { id, OR: [{ organizationId: user.organizationId }, { organizationId: null }] },
    select: listSelect,
  })
  // ไม่มีจริง กับ อยู่นอกองค์กร ต้องตอบเหมือนกัน — ไม่ leak ว่ามีงานนั้นอยู่
  if (row === null) throw new JobError('JOB_NOT_FOUND', { detail: `job=${id} user=${user.id}` })
  return row
}

export async function getJob(user: SessionUser, id: string): Promise<JobDetailDto> {
  assertJobsReadable(user)
  return toDetail(await findJobRow(user, id))
}

/** `POST /api/jobs` (`91` §14) — คีย์กันซ้ำเดิม = คืนงานเดิม ไม่สร้างใหม่ (`91` §11) */
export async function createJob(
  ctx: { actor: SessionUser; meta: RequestMeta },
  input: JobCreateInput,
): Promise<JobCreateResultDto> {
  assertJobsReadable(ctx.actor)
  const { job, duplicate } = await enqueueJob({
    organizationId: ctx.actor.organizationId,
    jobType: input.jobType,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    scheduledAt: input.scheduledAt === undefined ? null : new Date(input.scheduledAt),
    createdBy: ctx.actor.id,
    actorRole: ctx.actor.roleName,
    reason: `สั่งงานเบื้องหลัง "${jobTypeLabel(input.jobType)}" (คีย์กันซ้ำ ${input.idempotencyKey})`,
  })

  return { job: toDetail({ ...job, createdByUser: { fullName: ctx.actor.fullName } }), duplicate }
}

/**
 * `POST /api/jobs/:id/retry` (`91` §14) — Superadmin เท่านั้น + ต้องมีเหตุผล
 *
 * คืนงานกลับเข้าคิวและ **รีเซ็ต `retry_count` เป็น 0** (ไม่งั้น dead letter จะตกกลับเป็น dead letter
 * ทันทีในรอบแรก) · ค่าเดิมถูกเก็บไว้ในฝั่ง `before` ของ audit จึงยังตรวจย้อนหลังได้
 * งานจะถูกหยิบไปทำในรอบถัดไปของตัวตั้งเวลา — ที่นี่ไม่รันทันทีเพื่อไม่ให้ request ค้างยาว
 */
export async function retryJob(
  ctx: { actor: SessionUser; meta: RequestMeta },
  id: string,
  input: JobRetryInput,
  now: Date = new Date(),
): Promise<JobDetailDto> {
  assertJobsReadable(ctx.actor)
  assertJobRetryAllowed(ctx.actor)

  const before = await findJobRow(ctx.actor, id)
  if (!canManualRetry(before)) {
    throw new JobError('JOB_INVALID_STATUS', { detail: `job=${id} status=${before.status}` })
  }

  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: 'pending',
      retryCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      scheduledAt: now,
    },
    select: listSelect,
  })

  await emitAudit({
    organizationId: before.organizationId ?? ctx.actor.organizationId,
    actorId: ctx.actor.id,
    actorRole: ctx.actor.roleName,
    action: 'update',
    targetType: 'jobs',
    targetId: id,
    before: { status: before.status, retryCount: before.retryCount, errorMessage: before.errorMessage },
    after: { status: updated.status, retryCount: updated.retryCount },
    reason: input.reason,
    ipAddress: ctx.meta.ipAddress,
    userAgent: ctx.meta.userAgent,
  })

  return toDetail(updated)
}

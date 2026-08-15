import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_JOBS } from '@/lib/jobs/access'
import { runJobById } from '@/lib/jobs/engine'
import { JobError } from '@/lib/jobs/errors'
import { DEV_TRIGGER_JOB_TYPES, isKnownJobType } from '@/lib/jobs/job-types'
import { createJob, getJob } from '@/lib/jobs/queries'
import { jobDevTriggerSchema } from '@/lib/jobs/schemas'

/** handler บางตัวประกอบไฟล์ PDF/Excel — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `POST /api/dev/trigger-job` (`91` §14.1) — สั่ง job ทดสอบทันทีโดยไม่ต้องรอ Vercel Cron
 *
 * **ปิดตัวเองใน production เสมอ** — ตอบ `404` เหมือนไม่มี route นี้อยู่ (`91` §14.1 ข้อแรก)
 * นอกนั้นเดินทางเดียวกับ `POST /api/jobs` ทุกประการ (คีย์กันซ้ำ + audit + สิทธิ์เดียวกัน) —
 * ต่างแค่ "ไม่ต้องรอรอบเวลา" คือรัน handler ให้เลยหลังสร้าง job
 *
 * job_type รับได้ **5 ตัวของ `91` §6.1 เท่านั้น** (C8 — รวม `advance_overdue`) · นอกรายการ
 * ถูกปฏิเสธด้วย `JOB_INVALID_STATUS` ซึ่งคือรูป prefix ตาม `24` §7 ของ `INVALID_STATUS` ใน §14.1
 */
/** ต้องตอบ 404 **ก่อน**ชั้นสิทธิ์ — ถ้าปล่อยให้ 401/403 ออกไปก่อน คนนอกก็รู้ว่ามี route นี้อยู่ */
function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

const triggerJob = withApiPermission(
  'manage',
  MANAGE_JOBS,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const body = await readJsonBody(request)
    const requestedType = (body as { jobType?: unknown } | null)?.jobType
    if (typeof requestedType === 'string' && isKnownJobType(requestedType) && !DEV_TRIGGER_JOB_TYPES.includes(requestedType)) {
      throw new JobError('JOB_INVALID_STATUS', {
        detail: `dev trigger รองรับเฉพาะ ${DEV_TRIGGER_JOB_TYPES.join('/')} (ขอ ${requestedType})`,
      })
    }

    const parsed = jobDevTriggerSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const now = new Date()
    const created = await createJob(
      { actor: user, meta: getRequestMeta(request) },
      {
        jobType: parsed.data.jobType,
        payload: parsed.data.payload,
        // คีย์กันซ้ำผูกกับ "นาทีที่กด" — กดรัวในนาทีเดียวกันได้ job เดิม แต่ยังสั่งซ้ำนาทีถัดไปได้
        idempotencyKey: `dev:${parsed.data.jobType}:${user.id}:${now.toISOString().slice(0, 16)}`,
      },
    )

    // งานที่คืนมาแบบ duplicate อาจทำไปแล้ว — `runJobById()` หยิบเฉพาะที่ยัง `pending` เท่านั้น
    const outcome = await runJobById(created.job.id, now)

    return apiSuccess({ job: await getJob(user, created.job.id), duplicate: created.duplicate, outcome })
  },
)

export async function POST(request: NextRequest, context: unknown): Promise<Response> {
  if (process.env.NODE_ENV === 'production') return notFound()
  return triggerJob(request, context)
}

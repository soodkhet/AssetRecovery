import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_JOBS } from '@/lib/jobs/access'
import { runJobById } from '@/lib/jobs/engine'
import { JobError } from '@/lib/jobs/errors'
import {
  ADVANCE_OVERDUE_AS_OF_MAX_DAYS,
  DEV_TRIGGER_JOB_TYPES,
  DEV_TRIGGER_PAYLOAD_FLAG,
  isKnownJobType,
  jobTypeLabel,
  parseSettleDate,
  parseSimulatedAsOf,
} from '@/lib/jobs/job-types'
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
 * job_type รับได้ **6 ตัวของ `91` §6.1 เท่านั้น** (C8 — รวม `advance_overdue` · UAT Q21 `daily_field_allowance`) · นอกรายการ
 * ถูกปฏิเสธด้วย `JOB_INVALID_STATUS` ซึ่งคือรูป prefix ตาม `24` §7 ของ `INVALID_STATUS` ใน §14.1
 *
 * payload พิเศษที่รับได้เฉพาะทางนี้ (ตัวรันงานอ่านเฉพาะงานที่มีธง `DEV_TRIGGER_PAYLOAD_FLAG` นอก production):
 *  · `daily_field_allowance` + `{ date: 'YYYY-MM-DD' }` — settle วันนั้น (≤ วันนี้ตามเวลาไทย · UAT Q21)
 *  · `advance_overdue` + `{ asOf: 'YYYY-MM-DD' }` — **จำลองว่าวันนี้คือ asOf** (วันนี้ ถึง +31 วันตามเวลาไทย ·
 *    มติผู้ใช้ 04/10/2569) ⇒ รายการที่ `due_clear_date < asOf` ถูกมาร์ค overdue ทันที ไม่ต้องรอข้ามวัน ·
 *    audit reason มี `[จำลองวันที่ DD/MM/YYYY]` · ใส่ asOf กับ job_type อื่น = 400
 *    ตัวอย่าง: `{ "jobType": "advance_overdue", "payload": { "asOf": "2026-10-05" } }`
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
    // นอกรายการ (รู้จักแต่ไม่รองรับ / ไม่รู้จัก / ไม่ส่ง) ⇒ บอกเหตุจริงเป็นภาษาไทย ไม่ใช่ข้อความ
    // "สั่งงานใหม่ได้เฉพาะงานที่ล้มเหลว" หรือข้อความ Zod ภาษาอังกฤษดิบ (UAT BUG-114)
    const supported = typeof requestedType === 'string' && DEV_TRIGGER_JOB_TYPES.some((type) => type === requestedType)
    if (!supported) {
      const requestedLabel =
        typeof requestedType === 'string' && isKnownJobType(requestedType)
          ? `งาน "${jobTypeLabel(requestedType)}"`
          : 'ประเภทงานที่ส่งมา'
      throw new JobError('JOB_INVALID_STATUS', {
        detail: `dev trigger รองรับเฉพาะ ${DEV_TRIGGER_JOB_TYPES.join('/')} (ขอ ${String(requestedType)})`,
        message: `ทางลัดทดสอบไม่รองรับ${requestedLabel} — สั่งได้เฉพาะ: ${DEV_TRIGGER_JOB_TYPES.map(jobTypeLabel).join(' · ')}`,
      })
    }

    const parsed = jobDevTriggerSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const now = new Date()
    // `daily_field_allowance` รับ `date` (YYYY-MM-DD วันไทย ≤ วันนี้) ได้เฉพาะทางนี้ — มติ PO UAT Q21
    // (ตัวรันงานอ่าน `date` เฉพาะงานที่มีธง dev trigger นอก production — cron จริงไม่รับ)
    const settleDate = parsed.data.payload['date']
    if (parsed.data.jobType === 'daily_field_allowance' && settleDate !== undefined) {
      const dateCheck = z
        .object({
          date: z
            .string()
            .refine((value) => parseSettleDate(value, now) !== null, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD และไม่เกินวันนี้'),
        })
        .safeParse({ date: settleDate })
      if (!dateCheck.success) return validationErrorResponse(dateCheck.error)
    }
    const dateSuffix = typeof settleDate === 'string' ? `:${settleDate}` : ''

    // `advance_overdue` รับ `asOf` (วันที่จำลอง วันนี้..+31 วันตามเวลาไทย) ได้เฉพาะทางนี้ — มติผู้ใช้ 04/10/2569
    const asOf = parsed.data.payload['asOf']
    if (asOf !== undefined) {
      const asOfCheck = z
        .object({
          asOf: z
            .string()
            .refine(
              () => parsed.data.jobType === 'advance_overdue',
              'วันที่จำลองใช้ได้เฉพาะงานมาร์คเงินทดรองจ่ายที่เลยกำหนดเคลียร์',
            )
            .refine(
              (value) => parsed.data.jobType !== 'advance_overdue' || parseSimulatedAsOf(value, now) !== null,
              `วันที่จำลองต้องเป็นรูปแบบ YYYY-MM-DD ตั้งแต่วันนี้ถึงอีก ${ADVANCE_OVERDUE_AS_OF_MAX_DAYS} วันข้างหน้า`,
            ),
        })
        .safeParse({ asOf })
      if (!asOfCheck.success) return validationErrorResponse(asOfCheck.error)
    }
    const asOfSuffix = typeof asOf === 'string' ? `:asOf=${asOf}` : ''

    const created = await createJob(
      { actor: user, meta: getRequestMeta(request) },
      {
        jobType: parsed.data.jobType,
        payload: { ...parsed.data.payload, [DEV_TRIGGER_PAYLOAD_FLAG]: true },
        // คีย์กันซ้ำผูกกับ "นาทีที่กด" — กดรัวในนาทีเดียวกันได้ job เดิม แต่ยังสั่งซ้ำนาทีถัดไปได้
        idempotencyKey: `dev:${parsed.data.jobType}:${user.id}:${now.toISOString().slice(0, 16)}${dateSuffix}${asOfSuffix}`,
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

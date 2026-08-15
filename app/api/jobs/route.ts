import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_JOBS } from '@/lib/jobs/access'
import { createJob, listJobs } from '@/lib/jobs/queries'
import { jobCreateSchema, jobListQuerySchema } from '@/lib/jobs/schemas'

/**
 * `GET /api/jobs` (`91` §14) — รายการงานเบื้องหลังพร้อมตัวกรอง (job_type / สถานะ / ช่วงวันที่)
 * `POST /api/jobs` (`91` §14) — สั่งงานใหม่ · **ต้องมี `idempotencyKey`** (`01` §11)
 *
 * สิทธิ์: `manage_jobs` ระดับ `view` สำหรับดู · `manage` สำหรับสั่งงาน (`91` §12 "Trigger job")
 * คีย์กันซ้ำที่ใช้ไปแล้ว = คืน **job เดิม** พร้อม `duplicate: true` ไม่สร้างใหม่ (`91` §11)
 * ⇒ ตอบ 200 ไม่ใช่ 201 เพราะไม่มีอะไรถูกสร้าง
 */
export const GET = withApiPermission(
  'view',
  MANAGE_JOBS,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = jobListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listJobs(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_JOBS,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = jobCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await createJob({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(result, { status: result.duplicate ? 200 : 201 })
  },
)

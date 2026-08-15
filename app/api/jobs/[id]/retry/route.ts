import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_JOBS } from '@/lib/jobs/access'
import { retryJob } from '@/lib/jobs/queries'
import { jobRetrySchema } from '@/lib/jobs/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/jobs/:id/retry` (`91` §14) — สั่งงานที่ล้มเหลว/ล้มเหลวถาวรให้ทำใหม่
 *
 * **Superadmin เท่านั้น + ต้องระบุเหตุผล** (`91` §12) — capability `manage_jobs` ระดับ manage เป็น
 * ด่านแรก ส่วนการล็อกเฉพาะ Superadmin ตรวจซ้ำที่ `lib/jobs/queries.ts` (role อื่นที่ได้ manage
 * ยังสั่ง retry ไม่ได้) · งานถูกคืนเข้าคิว ตัวตั้งเวลาจะหยิบไปทำในรอบถัดไป
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  MANAGE_JOBS,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = jobRetrySchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await retryJob({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

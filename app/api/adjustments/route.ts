import type { NextRequest } from 'next/server'
import { CREATE_ADJUSTMENT, ADJUSTMENT_READ_CAPABILITIES } from '@/lib/adjustments/adjustment'
import { createAdjustment, listAdjustments } from '@/lib/adjustments/queries'
import { adjustmentCreateSchema, adjustmentListQuerySchema } from '@/lib/adjustments/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

/**
 * รายการปรับปรุง (`20` §14 · `27` §6.8) — `GET`/`POST /api/adjustments`
 *
 * อ่าน = ใครก็ตามที่อยู่ในสาย Adjustment (การเงิน/ผู้บริหาร) · สร้าง = การเงิน (`25` §7.4)
 * `period_status_at_target` ถูก snapshot ให้อัตโนมัติจากรายการต้นทาง — ผู้เรียกส่งมาเองไม่ได้
 */
export const GET = withApiPermission(
  'view',
  ADJUSTMENT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = adjustmentListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listAdjustments(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  CREATE_ADJUSTMENT,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = adjustmentCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createAdjustment({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(created, { status: 201 })
  },
)

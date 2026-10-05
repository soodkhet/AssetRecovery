import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_CUSTOMER_WHT } from '@/lib/customer-wht/customer-wht'
import { receiveCustomerWht } from '@/lib/customer-wht/queries'
import { customerWhtReceiveSchema } from '@/lib/customer-wht/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/customer-wht-certificates/:id/receive` (มติ PO 05/10/2569 U40)
 *
 * ได้รับหนังสือรับรอง 50 ทวิ จากลูกค้า — เลขที่/วันที่/ยอด + ไฟล์สแกน (บังคับ) ⇒ `received`
 * ยอดในหนังสือไม่ตรงยอดที่ถูกหัก = บันทึกได้ + `warnings` (ไม่บล็อก)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_CUSTOMER_WHT,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = customerWhtReceiveSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await receiveCustomerWht({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { markWhtSupplementaryFiled } from '@/lib/wht/queries'
import { whtMarkSupplementaryFiledSchema } from '@/lib/wht/schemas'
import { MANAGE_WHT } from '@/lib/wht/wht'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/wht-filing-summary/:id/mark-supplementary-filed` (มติ PO 07/10/2569 U127)
 *
 * บัญชีบันทึกว่า "ยื่นเพิ่มเติมแล้ว" (ยื่นจริงนอกระบบ) — ล้างธงต้องยื่นเพิ่มเติม · เหตุผล/อ้างอิงการยื่นบังคับ
 * รอบที่ไม่ติดธง = `WHT_SUPPLEMENTARY_FILING_NOT_REQUIRED`
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_WHT,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = whtMarkSupplementaryFiledSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await markWhtSupplementaryFiled({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

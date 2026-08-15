import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { markWhtFilingFiled } from '@/lib/wht/queries'
import { whtMarkFiledSchema } from '@/lib/wht/schemas'
import { MANAGE_WHT } from '@/lib/wht/wht'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/wht-filing-summary/:id/mark-filed` (`33` §14) — `pending → filed`
 *
 * การยื่นแบบจริงเกิด**นอกระบบ** (สำนักงานบัญชี/e-Filing) — endpoint นี้แค่บันทึกว่ายื่นแล้วพร้อม
 * อ้างอิงที่ตามต่อได้ (`reason`) · mark ซ้ำไม่ได้ (`WHT_FILING_ALREADY_FILED`)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_WHT,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = whtMarkFiledSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await markWhtFilingFiled({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

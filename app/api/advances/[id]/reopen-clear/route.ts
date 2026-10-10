import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVE_ADVANCE, reopenAdvanceClear } from '@/lib/advances/queries'
import { advanceReopenClearSchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/advances/:id/reopen-clear` (staging E-012 · `23` §6.4 `reopen_clear` · `27` §6.4) — การเงินตีกลับการเคลียร์
 * `cleared → approved` + ล้างค่าการเคลียร์ · เหตุผลบังคับ · ทำไม่ได้เมื่อมีรายการต่อเนื่อง = `ADVANCE_CLEAR_NOT_REOPENABLE`
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVE_ADVANCE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = advanceReopenClearSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await reopenAdvanceClear({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

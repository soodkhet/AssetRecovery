import type { NextRequest } from 'next/server'
import { MANAGE_EXCEPTIONS } from '@/lib/accounting/exception'
import { resolveException } from '@/lib/accounting/queries'
import { exceptionResolveSchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/** `PATCH /api/exceptions/:id/resolve` (`34` §14) — ปิดรายการพร้อมคำอธิบายว่าแก้ต้นทางอย่างไร */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_EXCEPTIONS,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = exceptionResolveSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await resolveException({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

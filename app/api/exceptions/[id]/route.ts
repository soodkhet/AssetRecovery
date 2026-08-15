import type { NextRequest } from 'next/server'
import { MANAGE_EXCEPTIONS } from '@/lib/accounting/exception'
import { updateException } from '@/lib/accounting/queries'
import { exceptionUpdateSchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/exceptions/:id` (`34` §14 v2.1) — แก้รายละเอียดได้ **เฉพาะขณะ `open`**
 * (เปลี่ยนสถานะต้องผ่าน `/resolve` หรือ `/authorize` เท่านั้น — `23` §6.12)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_EXCEPTIONS,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = exceptionUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await updateException({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

import type { NextRequest } from 'next/server'
import { AUTHORIZE_EXCEPTION } from '@/lib/accounting/exception'
import { authorizeException } from '@/lib/accounting/queries'
import { exceptionAuthorizeSchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/exceptions/:id/authorize` (`34` §14) — **ผู้บริหารเท่านั้น** (`25` §7.5 "✅ only"
 * — capability `authorize_exception` ล็อกกับ role บริหารที่ `lib/roles/capability-locks.ts`)
 * เหตุผลบังคับ ⇒ ไม่กรอก = `AUTHORIZED_EXCEPTION_REASON_REQUIRED` · สถานะเปลี่ยนเป็น
 * `authorized` ทันที และปลดบล็อกเฉพาะรอบบัญชีของรายการนี้เท่านั้น
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  AUTHORIZE_EXCEPTION,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = exceptionAuthorizeSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await authorizeException({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)

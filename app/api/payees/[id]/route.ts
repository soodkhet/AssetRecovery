import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getPayee, MANAGE_PAYEE_PROFILE, updatePayee } from '@/lib/payees/queries'
import { payeeUpdateSchema } from '@/lib/payees/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET`/`PATCH /api/payees/:id` (`18` §14 · `27` §6.3)
 *
 * ⚠️ `PATCH` ที่แตะข้อมูลธนาคาร/ภาษีของ payee ที่ `verified` แล้ว จะ **reset เป็น unverified อัตโนมัติ**
 * (`18` §9 · `23` §6.2) — ต้องยืนยันใหม่ก่อนเข้ารอบจ่ายเงินรอบถัดไป
 */

export const GET = withApiPermission<RouteContext>(
  'view',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return apiSuccess(await getPayee(user, id))
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = payeeUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const result = await updatePayee({ actor: user, meta: getRequestMeta(request), reason }, id, values)
    return apiSuccess(result.payee, { warning: result.warning })
  },
)

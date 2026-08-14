import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getUser, setUserStatus } from '@/lib/users/queries'
import { userStatusChangeSchema } from '@/lib/users/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/users/:id/reactivate` (`08` §14) — เปิดใช้งานบัญชีที่ถูกระงับกลับมา
 *
 * เปิดกลับได้เฉพาะจาก `suspended` เท่านั้น — บัญชีที่ `deleted` (soft delete) ไม่มีทางกลับผ่าน UI
 * ต้องให้ Superadmin จัดการที่ฐานข้อมูลโดยตรง (`08` §7.2) → `INVALID_USER_STATUS_TRANSITION`
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = userStatusChangeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getUser(user, id)
    const updated = await setUserStatus(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
      'active',
    )

    return Response.json({ data: updated })
  },
)

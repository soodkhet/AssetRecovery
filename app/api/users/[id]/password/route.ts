import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getUser, setUserPassword } from '@/lib/users/queries'
import { userPasswordResetSchema } from '@/lib/users/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/users/:id/password` — ผู้ดูแลตั้งรหัสผ่านใหม่ให้ผู้ใช้ (มติ PO 03/10/2569 · แทน `/:id/invite` ของ D1)
 *
 * - สิทธิ์ = `manage:manage_users` เท่านั้น (ชุดเดียวกับคนที่เพิ่มผู้ใช้ได้) + scope ทีม/บริษัทที่ `getUser()`
 * - ไม่ใช่ Superadmin ตั้งรหัสให้ Superadmin ไม่ได้ → 403 `PERMISSION_DENIED`
 * - `reason` บังคับ เพราะกระทบสิทธิ์เข้าถึงระบบ (`90` §13) · audit ไม่มีรหัสผ่าน
 * - ผู้ใช้ต้องเปลี่ยนรหัสเองตอน login ครั้งถัดไป (ยกเว้นตั้งให้ตัวเอง)
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = userPasswordResetSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getUser(user, id)
    const updated = await setUserPassword(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
      parsed.data.password,
    )

    return Response.json({ data: updated })
  },
)

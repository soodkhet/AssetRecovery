import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteUser, getUser, updateUser } from '@/lib/users/queries'
import { userDeleteSchema, userUpdateSchema } from '@/lib/users/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET /api/users/:id` — ผู้ใช้รายคน (404 แบบไม่ leak ข้ามองค์กร · นอก scope = 403) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'manage_users',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getUser(user, id) })
  },
)

/**
 * `PATCH /api/users/:id` (`08` §14) — แก้ข้อมูลผู้ใช้ทั้งชุด รวม role และสังกัดทีม/บริษัท
 *
 * เปลี่ยน role ของ Superadmin คนสุดท้าย → `LAST_SUPERADMIN_REMOVAL` (`07` §11)
 * การเปลี่ยนสถานะ **ไม่ผ่าน endpoint นี้** — ใช้ `/suspend` และ `/reactivate` (Rule 04)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = userUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getUser(user, id)
    const { reason, ...values } = parsed.data

    const updated = await updateUser({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: updated })
  },
)

/**
 * `DELETE /api/users/:id` — soft delete (`08` §7.2) · ผู้ใช้ที่มีประวัติการทำงานลบไม่ได้
 * → `USER_HAS_HISTORY` ต้องใช้ระงับการใช้งานแทน (`08` §10)
 */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = userDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getUser(user, id)
    await deleteUser({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, current)

    return Response.json({ data: { id: current.id, deleted: true } })
  },
)

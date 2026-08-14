import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getUser, sendUserInvite } from '@/lib/users/queries'
import { userStatusChangeSchema } from '@/lib/users/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/users/:id/invite` — ส่งอีเมลคำเชิญตั้งรหัสผ่าน (ครั้งแรก / ส่งซ้ำ)
 *
 * มติ PO ปิด open item **D1**: ใช้ `inviteUserByEmail` ให้ผู้ใช้ตั้งรหัสผ่านเองที่ `/auth/set-password`
 * - **ใครส่งซ้ำได้** = ผู้มีสิทธิ์ `manage:manage_users` (ชุดเดียวกับคนที่สร้างผู้ใช้ได้)
 * - **อายุลิงก์** = ค่าของ Supabase project (Dashboard → Auth → Email link expiry) ไม่ override รายครั้ง
 * - `reason` บังคับ เพราะ mutation นี้แตะ `users.supabase_uid` (`90` §13 · `lib/audit/reason-policy.ts`)
 *
 * ส่งไม่สำเร็จ = `INVITE_SEND_FAILED` (502) — บัญชีผู้ใช้ยังอยู่ ไม่ต้องสร้างใหม่
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = userStatusChangeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getUser(user, id)
    const result = await sendUserInvite(
      {
        actor: user,
        meta: getRequestMeta(request),
        reason: parsed.data.reason,
        origin: new URL(request.url).origin,
      },
      current,
    )

    return Response.json(
      result.warning === null ? { data: result.user } : { data: result.user, warning: result.warning },
    )
  },
)

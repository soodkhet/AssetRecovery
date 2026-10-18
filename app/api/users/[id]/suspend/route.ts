import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getUser, setUserStatus } from '@/lib/users/queries'
import { userStatusChangeSchema } from '@/lib/users/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/users/:id/suspend` (`08` §14) — ระงับการใช้งานบัญชี
 *
 * transition endpoint แยกจาก PATCH ตาม Rule 04 เพราะมีกติกาของตัวเอง: **เหตุผลบังคับเสมอ** (`08` §13)
 * · ผู้ใช้ที่ถูกระงับ login ไม่ได้ (`05` §10) และ session cache ถูกล้างทันทีไม่ต้องรอ TTL
 * · Superadmin ที่ active คนสุดท้ายระงับไม่ได้ (`LAST_SUPERADMIN_REMOVAL` — `07` §11)
 *
 * งานค้างทุกชนิด (งานภาคสนาม · ใบเบิก · คิวรออนุมัติที่ผู้ใช้เป็นผู้ลงมือ/ผู้อนุมัติคนเดียว) เตือนบน UI ก่อนกดยืนยัน
 * ผ่าน `GET /api/users/:id/pending-work` (mytester7 S7-AG7-04) — ระบบไม่ส่งต่องานอัตโนมัติ
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
      'suspended',
    )

    return Response.json({ data: updated })
  },
)

import type { NextRequest } from 'next/server'
import { changeOwnPassword } from '@/lib/auth/auth-service'
import { toModuleErrorResponse } from '@/lib/api/http'
import { toAuthErrorBody } from '@/lib/auth/errors'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { changePasswordSchema } from '@/lib/auth/schemas'
import { requireSession } from '@/lib/auth/session'

/**
 * `POST /api/auth/change-password` — ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง (มติ PO 03/10/2569)
 *
 * endpoint เดียวที่ใช้ `requireSession({ allowPasswordChangePending })` — ต้องเรียกได้ตอน
 * `must_change_password = true` ซึ่งทุก endpoint อื่นปฏิเสธด้วย `PASSWORD_CHANGE_REQUIRED`
 * กระทำต่อบัญชีของผู้เรียกเองเท่านั้น (ไม่รับ user id จาก body) · ต้องยืนยันรหัสปัจจุบันเสมอ
 */
export async function POST(request: NextRequest): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json(toAuthErrorBody('REQUIRED_MISSING'), { status: 400 })
  }

  const parsed = changePasswordSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json(
      { ...toAuthErrorBody('REQUIRED_MISSING'), fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    const user = await requireSession(new Date(), { allowPasswordChangePending: true })
    const redirectTo = await changeOwnPassword(user, parsed.data, getRequestMeta(request))
    return Response.json({ data: { redirectTo } })
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}

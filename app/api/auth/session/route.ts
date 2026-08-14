import { toAuthErrorBody, toAuthErrorResponse } from '@/lib/auth/errors'
import { getSessionUser } from '@/lib/auth/session'
import { toClientSession } from '@/lib/auth/types'

/** `GET /api/auth/session` — ตรวจ session ปัจจุบัน + คืน role/capabilities/scope ให้ฝั่ง UI (`05` §14) */
export async function GET(): Promise<Response> {
  try {
    const user = await getSessionUser()
    if (!user) {
      return Response.json(toAuthErrorBody('UNAUTHENTICATED'), { status: 401 })
    }
    return Response.json({ data: { user: toClientSession(user) } })
  } catch (error) {
    return toAuthErrorResponse(error)
  }
}

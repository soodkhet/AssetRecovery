import type { NextRequest } from 'next/server'
import { logout } from '@/lib/auth/auth-service'
import { toAuthErrorResponse } from '@/lib/auth/errors'
import { getRequestMeta } from '@/lib/auth/request-meta'

/** `POST /api/auth/logout` — invalidate session + audit (`05` §14) */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    await logout(getRequestMeta(request))
    return Response.json({ data: { success: true } })
  } catch (error) {
    return toAuthErrorResponse(error)
  }
}

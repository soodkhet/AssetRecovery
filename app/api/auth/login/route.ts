import type { NextRequest } from 'next/server'
import { login } from '@/lib/auth/auth-service'
import { applyDevLoginAlias } from '@/lib/auth/dev-login-alias'
import { toAuthErrorBody, toAuthErrorResponse } from '@/lib/auth/errors'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { loginSchema } from '@/lib/auth/schemas'
import { toClientSession } from '@/lib/auth/types'

/** `POST /api/auth/login` — sign in ผ่าน Supabase Auth แล้วคืน session + ปลายทาง redirect (`05` §14) */
export async function POST(request: NextRequest): Promise<Response> {
  const meta = getRequestMeta(request)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json(toAuthErrorBody('REQUIRED_MISSING'), { status: 400 })
  }

  const parsed = loginSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json(
      {
        ...toAuthErrorBody('REQUIRED_MISSING'),
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  try {
    // ทางลัด admin/admin เฉพาะ `next dev` บน localhost (`lib/auth/dev-login-alias.ts`) — production ไม่มีผล
    const input = applyDevLoginAlias(parsed.data, {
      nodeEnv: process.env.NODE_ENV,
      aliasPassword: process.env.DEV_ADMIN_AUTH_PASSWORD,
      hostname: new URL(request.url).hostname,
    })
    const result = await login(input, meta)
    return Response.json({ data: { user: toClientSession(result.user), redirectTo: result.redirectTo } })
  } catch (error) {
    return toAuthErrorResponse(error)
  }
}

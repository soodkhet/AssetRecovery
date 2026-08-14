import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { acceptFieldCase } from '@/lib/field/queries'
import type { FieldActionResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/cases/:id/accept` (`41` §8 `accept_case`) — `pending_accept` → `accepted_unscheduled`
 * ใช้ service เดียวกับ `POST /api/cases/:id/accept` ของไฟล์ 40 (การกระทำเดียวกัน คนละหน้าจอ)
 */
export const POST = withEndpoint<RouteContext, FieldActionResultDto>({
  endpoint: 'field.acceptCase',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const data = await acceptFieldCase(user, id, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})

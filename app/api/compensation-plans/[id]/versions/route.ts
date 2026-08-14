import type { NextRequest } from 'next/server'
import { withApiPermission } from '@/lib/api/http'
import { toCompensationErrorResponse } from '@/lib/compensation/errors'
import { listCompensationPlanVersions } from '@/lib/compensation/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/compensation-plans/:id/versions` (`11` §14) — ประวัติทุกเวอร์ชันของแผนเดียวกัน (ใหม่→เก่า)
 * แผนหนึ่งชุดจับกลุ่มด้วย `name` (UNIQUE `organization_id, name, version` — `02` §5)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toCompensationErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await listCompensationPlanVersions(user.organizationId, id) })
  },
)

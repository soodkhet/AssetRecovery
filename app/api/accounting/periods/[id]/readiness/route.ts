import type { NextRequest } from 'next/server'
import { PERIOD_READ_CAPABILITIES } from '@/lib/accounting/period'
import { getPeriodReadiness } from '@/lib/accounting/queries'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/accounting/periods/:id/readiness` (`30` §14) — ตรวจความพร้อม **สดทุกครั้ง**
 * checklist 3 เงื่อนไขตาม `30` §6.2 (warning ผ่านได้แต่ต้องแสดงเตือน) — อ่านอย่างเดียว ไม่เขียน DB
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  PERIOD_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return apiSuccess(await getPeriodReadiness(user, id))
  },
)

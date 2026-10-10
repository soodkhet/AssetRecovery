import type { NextRequest } from 'next/server'
import { PERIOD_READ_CAPABILITIES } from '@/lib/accounting/period'
import { getPeriodReadiness, recordPeriodReadiness } from '@/lib/accounting/queries'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

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

/**
 * `POST /api/accounting/periods/:id/readiness` — staging E-069 (มติ PO 10/10/2569) ตรวจสดแบบเดียวกับ GET
 * แล้ว**บันทึกเวลา + ผล (ผ่าน N/M) + audit** ลงรอบบัญชี · สิทธิ์เท่าผู้เปิดดูได้ (การตรวจไม่เปลี่ยนสถานะ/ยอดใด ๆ)
 */
export const POST = withApiPermission<RouteContext>(
  'view',
  PERIOD_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    return apiSuccess(await recordPeriodReadiness({ actor: user, meta: getRequestMeta(request) }, id))
  },
)

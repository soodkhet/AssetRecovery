import type { NextRequest } from 'next/server'
import { withApiPermission } from '@/lib/api/http'
import { toServiceFeeErrorResponse } from '@/lib/service-fee/errors'
import { listServiceFeeTemplateVersions } from '@/lib/service-fee/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/service-fee-templates/:id/versions` — ประวัติทุกเวอร์ชันของเทมเพลตเดียวกัน (ใหม่→เก่า)
 * `12` §14 ไม่ได้ระบุ endpoint นี้ไว้ แต่ตาราง `service_fee_templates` มี versioning เต็มรูปแบบ
 * (`02` §5) และหน้าจอต้องแสดงประวัติเหมือนแผนค่าตอบแทน — เพิ่มเป็น read-only คู่กับ `11` §14
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toServiceFeeErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await listServiceFeeTemplateVersions(user.organizationId, id) })
  },
)

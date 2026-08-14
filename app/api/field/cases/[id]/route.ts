import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { getFieldCase } from '@/lib/field/queries'
import type { FieldCaseDetailDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/field/cases/:id` (`41` §7.7 · §17.1 · `45` §6.3) — รายละเอียดเคสเต็ม
 * รวม 3 ที่อยู่ / ช่องทางติดต่อ / เอกสาร / เช็คอินที่ทำไปแล้ว / draft / จุดเริ่มเดินทาง
 */
export const GET = withEndpoint<RouteContext, FieldCaseDetailDto>({
  endpoint: 'field.caseDetail',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return { data: await getFieldCase(user, id) }
  },
})

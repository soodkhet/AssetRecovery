import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { WAREHOUSE_READ_CAPABILITIES } from '@/lib/warehouse/permissions'
import { getAsset } from '@/lib/warehouse/queries'
import type { AssetDetailDto } from '@/lib/warehouse/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/assets/:id` (`44` §15) — รายละเอียดเครื่อง + ล็อตที่อยู่ (ถ้ามี)
 *
 * เครื่องนอก scope ตอบ `ASSET_NOT_FOUND` เหมือนเครื่องที่ไม่มีจริง — ห้าม leak ว่ามีของบริษัทอื่น (§13)
 */
export const GET = withEndpoint<RouteContext, AssetDetailDto>({
  endpoint: 'asset.detail',
  action: 'view',
  resource: WAREHOUSE_READ_CAPABILITIES,
  handler: async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return { data: await getAsset(user, id) }
  },
})

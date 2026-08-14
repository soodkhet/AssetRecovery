import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { WAREHOUSE_READ_CAPABILITIES } from '@/lib/warehouse/permissions'
import { getLot } from '@/lib/warehouse/queries'
import type { LotDetailDto } from '@/lib/warehouse/types'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET /api/handover-lots/:id` (`44` §15) — รายละเอียดล็อต + รายการเครื่องในล็อต (drill-down §8.4/§8.5) */
export const GET = withEndpoint<RouteContext, LotDetailDto>({
  endpoint: 'lot.detail',
  action: 'view',
  resource: WAREHOUSE_READ_CAPABILITIES,
  handler: async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return { data: await getLot(user, id) }
  },
})

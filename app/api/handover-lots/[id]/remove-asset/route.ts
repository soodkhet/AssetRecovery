import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { WAREHOUSE_CREATE_LOT_CAPABILITY } from '@/lib/warehouse/permissions'
import { removeAssetFromLot } from '@/lib/warehouse/queries'
import { lotRemoveAssetSchema } from '@/lib/warehouse/schemas'
import type { LotDetailDto } from '@/lib/warehouse/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/handover-lots/:id/remove-asset` (`44` §15 · `45` §6.5 — มติชั่วคราว M5 · mytester WH-05)
 * นำเครื่องออกจากล็อตที่ยังไม่ยืนยัน ⇒ เครื่องกลับ "ในคลัง" รอจัดล็อตใหม่ · เหตุผลบังคับ · audit
 * สิทธิ์เดียวกับจัดการล็อต (`create_handover_lot`) · ล็อตยืนยันแล้ว = `LOT_ALREADY_CONFIRMED`
 */
export const PATCH = withEndpoint<RouteContext, LotDetailDto>({
  endpoint: 'lot.remove_asset',
  action: 'manage',
  resource: WAREHOUSE_CREATE_LOT_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = lotRemoveAssetSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await removeAssetFromLot(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})

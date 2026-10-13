import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { WAREHOUSE_CREATE_LOT_CAPABILITY, WAREHOUSE_READ_CAPABILITIES } from '@/lib/warehouse/permissions'
import { deleteEmptyLot, getLot } from '@/lib/warehouse/queries'
import { lotDeleteSchema } from '@/lib/warehouse/schemas'
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

/**
 * `DELETE /api/handover-lots/:id` (known Q9 — มติ 13/10/2569 Claude ตัดสินแทน PO รอยืนยัน)
 * ลบล็อตว่าง (ยังไม่ยืนยัน · ไม่มีเครื่องเหลือ) แบบ soft delete · เหตุผลบังคับ · audit
 * สิทธิ์เดียวกับจัดการล็อต (`create_handover_lot`) · ล็อตยืนยันแล้ว = `LOT_ALREADY_CONFIRMED` · ยังมีเครื่อง = `ASSET_ALREADY_IN_LOT`
 */
export const DELETE = withEndpoint<RouteContext, { id: string; lotNumber: string }>({
  endpoint: 'lot.delete',
  action: 'manage',
  resource: WAREHOUSE_CREATE_LOT_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = lotDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await deleteEmptyLot(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})

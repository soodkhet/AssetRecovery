import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { WAREHOUSE_CONFIRM_LOT_CAPABILITY } from '@/lib/warehouse/permissions'
import { confirmLot } from '@/lib/warehouse/queries'
import { lotConfirmSchema } from '@/lib/warehouse/schemas'
import type { LotConfirmResultDto } from '@/lib/warehouse/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/handover-lots/:id/confirm` (`44` §11) — **จุด trigger เดียวของทั้งระบบ**
 *
 * ยืนยันแล้วเกิด 4 อย่างใน `$transaction` เดียว: เครื่อง → `handed_over` · ปลดล็อก expense
 * (`pending_warehouse_confirm` → `pending_approval`) · audit `lot.confirmed` · เกต Revenue (`19` §6.1)
 * — step ใดล้ม rollback ทั้งชุดแล้วตอบ `CONFIRM_TRANSACTION_FAILED` (500) โดยไม่มีอะไรค้างครึ่งทาง
 *
 * เอกสารบังคับตามชนิดล็อต (§6.3): ใบเซ็นรับทุกแบบ + หลักฐานจัดส่งเฉพาะ `we_deliver`
 * ไม่ส่ง url มาในคำขอนี้ = ใช้ไฟล์ที่แนบไว้ก่อนหน้า · ล็อตที่ยืนยันแล้วตอบ `LOT_ALREADY_CONFIRMED`
 */
export const PATCH = withEndpoint<RouteContext, LotConfirmResultDto>({
  endpoint: 'lot.confirm',
  action: 'manage',
  resource: WAREHOUSE_CONFIRM_LOT_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = lotConfirmSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await confirmLot(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})

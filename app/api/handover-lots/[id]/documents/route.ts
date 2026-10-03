import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { WAREHOUSE_CONFIRM_LOT_CAPABILITY } from '@/lib/warehouse/permissions'
import { attachLotDocument } from '@/lib/warehouse/queries'
import { lotDocumentAttachSchema } from '@/lib/warehouse/schemas'
import type { LotDetailDto } from '@/lib/warehouse/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/handover-lots/:id/documents` (`44` §6.4 · §15 — มติ PO 03/10/2569 UAT Q13 · ปิดหนี้ #1)
 *
 * ผูกเอกสารที่อัปโหลดขึ้น Storage แล้วเข้าล็อต — server ตรวจไฟล์เอง (มีจริง · path ต่อเวอร์ชันใต้ล็อตนี้ ·
 * ชนิดจากเนื้อไฟล์ · ขนาด) และเก็บ SHA-256 ที่คำนวณเอง · ล็อต `confirmed` แล้ว = `LOT_ALREADY_CONFIRMED`
 * สิทธิ์เดียวกับการยืนยันล็อต (แนบเอกสารเป็นส่วนหนึ่งของขั้นยืนยัน — `44` §8.4)
 */
export const POST = withEndpoint<RouteContext, LotDetailDto>({
  endpoint: 'lot.attachDocument',
  action: 'manage',
  resource: WAREHOUSE_CONFIRM_LOT_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = lotDocumentAttachSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await attachLotDocument(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})

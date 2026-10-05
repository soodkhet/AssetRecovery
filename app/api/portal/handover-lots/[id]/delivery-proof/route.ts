import type { NextRequest } from 'next/server'
import { toModuleErrorResponse } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { withPortal } from '@/lib/portal/guard'
import { getPortalLotDeliveryProof } from '@/lib/portal/queries/handover'

type RouteContext = { params: Promise<{ id: string }> }

/** อ่านไฟล์จาก Storage ด้วย service role — Node runtime เท่านั้น */
export const runtime = 'nodejs'

/**
 * `GET /api/portal/handover-lots/:id/delivery-proof` (`97` §6.4 · §17 · §18 · มติ PO 05/10/2569 U13) — หลักฐานการจัดส่ง
 * · เฉพาะล็อตแบบเราส่ง (`we_deliver`) ที่แนบหลักฐานแล้ว · ไฟล์ stream ผ่าน server (DEC-014) · ห้าม cache
 * · สิทธิ์ `portal_handover` + `portal_download` · id ข้ามบริษัท/ล็อตที่บริษัทรับเอง = 403 + audit
 * ⚠️ namespace พอร์ทัล = GET เท่านั้น (`97` §11)
 */
export const GET = withPortal<RouteContext>('handover', { download: true }, async (request: NextRequest, context, portal) => {
  const { id } = await context.params
  try {
    const file = await getPortalLotDeliveryProof(portal, id, request)
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'content-type': file.contentType,
        'content-disposition': attachmentHeader(file.fileName),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    return toModuleErrorResponse(error)
  }
})

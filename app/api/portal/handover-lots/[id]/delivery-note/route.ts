import type { NextRequest } from 'next/server'
import { toModuleErrorResponse } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { withPortal } from '@/lib/portal/guard'
import { getPortalLotDeliveryNote } from '@/lib/portal/queries/handover'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `GET /api/portal/handover-lots/:id/delivery-note` (`97` §6.4 · §17 · §18 · มติ PO 05/10/2569 U13) — ใบส่งมอบ PDF จากระบบ
 * · renderer เดียวกับภายใน (มี IMEI — เอกสารของบริษัทเอง) · ดาวน์โหลดได้ตั้งแต่สร้างล็อต
 * · สิทธิ์ `portal_handover` + `portal_download` · id ข้ามบริษัท = 403 + audit · ห้าม cache
 * ⚠️ namespace พอร์ทัล = GET เท่านั้น (`97` §11)
 */
export const GET = withPortal<RouteContext>('handover', { download: true }, async (request: NextRequest, context, portal) => {
  const { id } = await context.params
  try {
    const file = await getPortalLotDeliveryNote(portal, id, request)
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

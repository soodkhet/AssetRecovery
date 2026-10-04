import type { NextRequest } from 'next/server'
import { toModuleErrorResponse } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { withPortal } from '@/lib/portal/guard'
import { getPortalLotSignedDoc } from '@/lib/portal/queries/handover'

type RouteContext = { params: Promise<{ id: string }> }

/** อ่านไฟล์จาก Storage ด้วย service role — Node runtime เท่านั้น */
export const runtime = 'nodejs'

/**
 * `GET /api/portal/handover-lots/:id/download` (`97` §6.4 · §17 · §18 · มติ O43 D8) — ใบส่งมอบที่มีลายเซ็นผู้รับ
 * · สิทธิ์ `portal_handover` + `portal_download` · เฉพาะล็อต `confirmed` (นอกนั้น 403 + audit)
 * · ไฟล์ stream ผ่าน server (DEC-014 — ไม่เปิด URL ของ bucket) · ห้าม cache
 * ⚠️ namespace พอร์ทัล = GET เท่านั้น (`97` §11)
 */
export const GET = withPortal<RouteContext>('handover', { download: true }, async (request: NextRequest, context, portal) => {
  const { id } = await context.params
  try {
    const file = await getPortalLotSignedDoc(portal, id, request)
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

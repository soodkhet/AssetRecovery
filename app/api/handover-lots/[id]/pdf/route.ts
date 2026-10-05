import type { NextRequest } from 'next/server'
import { renderHandoverNote } from '@/components/pdf/handover-note'
import { withEndpoint } from '@/lib/api/http'
import { emitDocumentExportAudit } from '@/lib/audit/audit'
import { attachmentHeader } from '@/lib/format/attachment'
import { buildHandoverDoc, handoverFileName } from '@/lib/warehouse/handover-doc'
import { WAREHOUSE_EXPORT_CAPABILITIES } from '@/lib/warehouse/permissions'
import { getHandoverDocSource } from '@/lib/warehouse/queries'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API (fs/stream) — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `GET /api/handover-lots/:id/pdf` (`44` §15 · §6.4) — ใบส่งมอบ PDF
 *
 * เอกสารออกจาก template เดียวเสมอ เลขที่ (`DLV-YYYY-XXX` พ.ศ.) มาจากล็อต **ไม่เดินเลขใหม่ตอนพิมพ์**
 * ⇒ พิมพ์ซ้ำกี่ครั้งก็ได้เอกสารเลขเดิม (§10 "Lot Number Immutable") · ล็อตนอก scope = `LOT_NOT_FOUND`
 */
export const GET = withEndpoint<RouteContext, never>({
  endpoint: 'lot.pdf',
  action: 'view',
  resource: WAREHOUSE_EXPORT_CAPABILITIES,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const source = await getHandoverDocSource(user, id)
    const pdf = await renderHandoverNote(buildHandoverDoc(source.lot, source.issuer, source.recipient))

    const fileName = handoverFileName(source.lot, 'pdf')
    // ทุกการนำเอกสารออกต้อง trace ผู้สั่งได้ (Rule 03)
    await emitDocumentExportAudit({
      actor: user,
      request,
      targetType: 'handover_lots',
      targetId: source.lot.id,
      document: 'handover_note_pdf',
      fileName,
      details: { lot_number: source.lot.lotNumber, doc_ref: source.lot.docRef, lot_status: source.lot.status },
    })

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(fileName),
        // เอกสารเปลี่ยนได้จนกว่าล็อตจะ confirmed — ห้าม cache ฝั่ง CDN/เบราว์เซอร์
        'cache-control': 'no-store',
      },
    })
  },
})

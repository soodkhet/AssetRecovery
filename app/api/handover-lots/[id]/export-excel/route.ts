import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { emitDocumentExportAudit } from '@/lib/audit/audit'
import { attachmentHeader } from '@/lib/format/attachment'
import { buildHandoverDoc, handoverFileName } from '@/lib/warehouse/handover-doc'
import { buildHandoverWorkbook } from '@/lib/warehouse/handover-excel'
import { WAREHOUSE_EXPORT_CAPABILITIES } from '@/lib/warehouse/permissions'
import { getHandoverDocSource } from '@/lib/warehouse/queries'

type RouteContext = { params: Promise<{ id: string }> }

/** SheetJS เขียนไฟล์ผ่าน Buffer ของ Node */
export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * `GET /api/handover-lots/:id/export-excel` (`44` §15 · §6.4) — รายการเครื่องในล็อตเป็น `.xlsx`
 *
 * คอลัมน์เรียงเหมือนตารางในใบส่งมอบ PDF (`handover-doc.ts` เป็นแบบข้อมูลร่วมของทั้งสองเอกสาร)
 * ⚠️ ไม่ใช่ export ของ `37` (Accounting Pack) — ไฟล์นี้ **ไม่ลง `export_records`/ไม่ทำ version**
 *    เพราะเป็นเอกสารปฏิบัติการของคลัง ไม่ใช่ชุดส่งสำนักงานบัญชี
 */
export const GET = withEndpoint<RouteContext, never>({
  endpoint: 'lot.exportExcel',
  action: 'view',
  resource: WAREHOUSE_EXPORT_CAPABILITIES,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const source = await getHandoverDocSource(user, id)
    const workbook = buildHandoverWorkbook(buildHandoverDoc(source.lot, source.issuer, source.recipient))

    const fileName = handoverFileName(source.lot, 'xlsx')
    // ทุกการนำเอกสารออกต้อง trace ผู้สั่งได้ (Rule 03)
    await emitDocumentExportAudit({
      actor: user,
      request,
      targetType: 'handover_lots',
      targetId: source.lot.id,
      document: 'handover_note_xlsx',
      fileName,
      details: { lot_number: source.lot.lotNumber, doc_ref: source.lot.docRef, lot_status: source.lot.status },
    })

    return new Response(new Uint8Array(workbook), {
      headers: {
        'content-type': XLSX_CONTENT_TYPE,
        'content-disposition': attachmentHeader(fileName),
        'cache-control': 'no-store',
      },
    })
  },
})

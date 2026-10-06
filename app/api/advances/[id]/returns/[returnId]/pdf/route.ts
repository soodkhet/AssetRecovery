import type { NextRequest } from 'next/server'
import { renderAdvanceReturnPdf } from '@/components/pdf/advance-return'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { advanceReturnFileName, buildAdvanceReturnDoc } from '@/lib/advances/advance-doc'
import { getAdvanceReturnDocSource } from '@/lib/advances/doc-queries'
import { APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/queries'
import { emitDocumentExportAudit } from '@/lib/audit/audit'
import { attachmentHeader } from '@/lib/format/attachment'
import { issuedDocumentLetterhead } from '@/lib/organization/letterhead'

type RouteContext = { params: Promise<{ id: string; returnId: string }> }

export const runtime = 'nodejs'

/**
 * `GET /api/advances/:id/returns/:returnId/pdf` — **ใบรับคืนเงินทดรอง** ต่อแถว `advance_returns` (เลข RAV · มติ PO U100/U101)
 *
 * สิทธิ์/scope เดียวกับใบเบิก (เจ้าของ + การเงิน · คนอื่น 404) · แถวที่กลับรายการแล้วยังพิมพ์ได้ พร้อมป้าย "ยกเลิก"
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  [REQUEST_ADVANCE, APPROVE_ADVANCE],
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id, returnId } = await context.params
    const source = await getAdvanceReturnDocSource(user, id, returnId)

    // มติ PO U130 — หัวกระดาษ ณ ตอนบันทึกรับคืน (แถวก่อน U130 = ค่าปัจจุบัน)
    const letterhead = await issuedDocumentLetterhead(user.organizationId, source.letterheadSnapshot)
    const pdf = await renderAdvanceReturnPdf(buildAdvanceReturnDoc(source, letterhead), letterhead)
    const fileName = advanceReturnFileName(source.returnNumber)

    await emitDocumentExportAudit({
      actor: user,
      request,
      targetType: 'advance_returns',
      targetId: returnId,
      document: 'advance_return_pdf',
      fileName,
      details: {
        return_number: source.returnNumber,
        advance_number: source.advance.advanceNumber,
        reversed: source.reversedAt !== null,
      },
    })

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(fileName),
        'cache-control': 'no-store',
      },
    })
  },
)

import type { NextRequest } from 'next/server'
import { renderAdvanceRequestPdf } from '@/components/pdf/advance-request'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { advanceRequestFileName, assertAdvanceRequestPrintable, buildAdvanceRequestDoc } from '@/lib/advances/advance-doc'
import { getAdvanceRequestDocSource } from '@/lib/advances/doc-queries'
import { APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/queries'
import { emitDocumentExportAudit } from '@/lib/audit/audit'
import { attachmentHeader } from '@/lib/format/attachment'
import { issuedDocumentLetterhead } from '@/lib/organization/letterhead'

type RouteContext = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

/**
 * `GET /api/advances/:id/pdf` — **ใบเบิกเงินทดรอง** (มติ PO U100/U101 · `28` §6.1) ต้นฉบับเดียว
 *
 * สิทธิ์ = `view` ของ `request_advance` (เจ้าของ) หรือ `approve_advance` (การเงิน) · scope ระดับแถว
 * (เจ้าของเห็นของตัวเอง — คนอื่น 404) · พิมพ์ได้ตั้งแต่อนุมัติแล้ว · ทุกการดาวน์โหลดลง audit `export`
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  [REQUEST_ADVANCE, APPROVE_ADVANCE],
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const source = await getAdvanceRequestDocSource(user, id)
    assertAdvanceRequestPrintable(source.status, id)

    // มติ PO U130 — หัวกระดาษ ณ ตอนอนุมัติ (ใบก่อน U130 = ค่าปัจจุบัน)
    const letterhead = await issuedDocumentLetterhead(user.organizationId, source.letterheadSnapshot)
    const pdf = await renderAdvanceRequestPdf(buildAdvanceRequestDoc(source, letterhead), letterhead)
    const fileName = advanceRequestFileName(source.advanceNumber)

    await emitDocumentExportAudit({
      actor: user,
      request,
      targetType: 'advances',
      targetId: id,
      document: 'advance_request_pdf',
      fileName,
      details: { advance_number: source.advanceNumber },
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

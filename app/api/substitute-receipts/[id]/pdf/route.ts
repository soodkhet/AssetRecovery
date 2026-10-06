import type { NextRequest } from 'next/server'
import { renderSubstituteReceiptPdf } from '@/components/pdf/substitute-receipt'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { emitDocumentExportAudit } from '@/lib/audit/audit'
import { attachmentHeader } from '@/lib/format/attachment'
import { issuedDocumentLetterhead } from '@/lib/organization/letterhead'
import {
  getSubstituteReceiptSource,
  SUBSTITUTE_RECEIPT_CAPABILITIES,
  toSubstituteReceiptDocSource,
} from '@/lib/substitute-receipts/queries'
import { substituteReceiptFileName } from '@/lib/substitute-receipts/substitute-receipt'
import { buildSubstituteReceiptDoc } from '@/lib/substitute-receipts/substitute-receipt-doc'

type RouteContext = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

/**
 * `GET /api/substitute-receipts/:id/pdf` — **ใบรับรองแทนใบเสร็จรับเงิน** (มติ PO U103) ให้ผู้จ่ายเงินดาวน์โหลดไปเซ็น
 *
 * สิทธิ์ = capability ฝั่งเบิก/อนุมัติอย่างน้อย 1 ตัว + scope ระดับแถว (เจ้าของ · การเงิน/ผู้อนุมัติที่เห็นรายการนั้น)
 * นอก scope = `SUBSTITUTE_RECEIPT_NOT_FOUND` (404 ไม่ leak) · ทุกการดาวน์โหลดลง audit `export`
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  SUBSTITUTE_RECEIPT_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const row = await getSubstituteReceiptSource(user, id)

    // มติ PO U130 — หัวกระดาษ ณ ตอนออกใบ (ใบก่อน U130 = ค่าปัจจุบัน)
    const letterhead = await issuedDocumentLetterhead(user.organizationId, row.letterheadSnapshot)
    const pdf = await renderSubstituteReceiptPdf(
      buildSubstituteReceiptDoc(toSubstituteReceiptDocSource(row), letterhead),
      letterhead,
    )
    const fileName = substituteReceiptFileName(row.receiptNumber)

    await emitDocumentExportAudit({
      actor: user,
      request,
      targetType: 'substitute_receipts',
      targetId: id,
      document: 'substitute_receipt_pdf',
      fileName,
      details: { receipt_number: row.receiptNumber, status: row.status },
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

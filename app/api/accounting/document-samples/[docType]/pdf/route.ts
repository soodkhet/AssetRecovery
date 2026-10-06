import type { NextRequest } from 'next/server'
import { renderDocumentSample } from '@/components/pdf/document-samples'
import { fieldErrorResponse, toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import {
  DOCUMENT_SAMPLES_CAPABILITY,
  documentSampleFileName,
  isDocumentSampleType,
} from '@/lib/documents/samples/catalog'
import { loadDocumentSampleContext } from '@/lib/documents/samples/queries'
import { attachmentHeader } from '@/lib/format/attachment'

type RouteContext = { params: Promise<{ docType: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API (fs/stream) — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `GET /api/accounting/document-samples/:docType/pdf` — PDF ตัวอย่างเอกสาร 1 ชนิด (มติ PO U104)
 *
 * เรนเดอร์ด้วย component/builder ตัวเดียวกับเอกสารจริง · ข้อมูลธุรกรรมเป็นข้อมูลสมมติคงที่ · หัวเอกสาร/โลโก้ = องค์กรจริง
 * · ทุกหน้ามีลายน้ำ + แถบ "ตัวอย่าง — ไม่ใช่เอกสารจริง" · เลขที่ = เลขถัดไปตามค่าตั้ง (ไม่เดินตัวนับ)
 * · **ไม่ลง audit export**: ไม่มีข้อมูลจริงของลูกค้า/ผู้รับเงินออกจากระบบ และไม่เปลี่ยนสถานะใด ๆ (GET อ่านอย่างเดียว)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  DOCUMENT_SAMPLES_CAPABILITY,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { docType } = await context.params
    if (!isDocumentSampleType(docType)) {
      return fieldErrorResponse({ docType: 'ไม่พบชนิดเอกสารตัวอย่างนี้' })
    }
    const pdf = await renderDocumentSample(docType, await loadDocumentSampleContext(user.organizationId))
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(documentSampleFileName(docType)),
        'cache-control': 'no-store',
      },
    })
  },
)

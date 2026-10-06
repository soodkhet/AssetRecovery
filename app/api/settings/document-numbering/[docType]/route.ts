import type { NextRequest } from 'next/server'
import {
  fieldErrorResponse,
  readJsonBody,
  toModuleErrorResponse,
  validationErrorResponse,
  withApiPermission,
} from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { assertNumberingSequenceUntouched, updateDocumentNumbering } from '@/lib/document-numbering/queries'
import {
  bodyTouchesNumberingSequence,
  documentNumberTypeSchema,
  documentNumberingUpdateSchema,
} from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ docType: string }> }

/**
 * `PATCH /api/settings/document-numbering/:docType` (มติ PO U102 · `13` §6.12)
 *
 * สิทธิ์: `manage:manage_invoice_numbering` = 1 ใน 9 รายการที่**ล็อกกับ Superadmin** · เหตุผลบังคับ + audit
 * · ส่งตัวนับมาเอง = `NUMBERING_SEQ_NOT_EDITABLE` · เอกสารภาษีที่ออกแล้วเปลี่ยนรูปแบบ = `NUMBERING_FORMAT_LOCKED`
 * · ตั้งเลขถัดไปต่ำกว่าเลขที่ใช้แล้ว = `NUMBERING_SEQ_BELOW_ISSUED`
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_invoice_numbering',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { docType } = await context.params
    const type = documentNumberTypeSchema.safeParse(docType)
    if (!type.success) return fieldErrorResponse({ docType: 'ไม่รู้จักชนิดเอกสารนี้' })

    const body = await readJsonBody(request)
    // ตรวจก่อน parse: Zod strip ฟิลด์แปลกปลอมทิ้งเงียบ ๆ ทำให้ผู้ใช้เข้าใจผิดว่าแก้ตัวนับได้
    assertNumberingSequenceUntouched(bodyTouchesNumberingSequence(body))

    const parsed = documentNumberingUpdateSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...input } = parsed.data
    const series = await updateDocumentNumbering(
      { actor: user, meta: getRequestMeta(request), reason },
      type.data,
      input,
    )
    return Response.json({ data: series })
  },
)

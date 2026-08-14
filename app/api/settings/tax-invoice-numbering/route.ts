import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  assertNumberingSequenceUntouched,
  getInvoiceNumbering,
  updateInvoiceNumbering,
} from '@/lib/settings/queries/numbering'
import { bodyTouchesNumberingSequence, numberingUpdateSchema } from '@/lib/settings/schemas'

/**
 * รูปแบบเลขที่ใบกำกับภาษี (`13` §6.12 · §13) — `GET`/`PATCH /api/settings/tax-invoice-numbering`
 *
 * สิทธิ์: แก้ = `manage:manage_invoice_numbering` = 1 ใน 9 รายการที่**ล็อกกับ Superadmin**
 * · ส่ง `lastNumber`/`lastResetYear` มาเอง = `NUMBERING_SEQ_NOT_EDITABLE` (`13` §6.12)
 * · เปลี่ยนรูปแบบหลังออกใบกำกับไปแล้ว = **เตือน ไม่ block** (คืนใน `warning` ของ envelope)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getInvoiceNumbering(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_invoice_numbering',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const body = await readJsonBody(request)
    // ตรวจก่อน parse: Zod strip ฟิลด์แปลกปลอมทิ้งเงียบ ๆ ทำให้ผู้ใช้เข้าใจผิดว่าแก้เลขได้
    assertNumberingSequenceUntouched(bodyTouchesNumberingSequence(body))

    const parsed = numberingUpdateSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...format } = parsed.data
    const result = await updateInvoiceNumbering({ actor: user, meta: getRequestMeta(request), reason }, format)
    return Response.json({ data: result.numbering, ...(result.warning === null ? {} : { warning: result.warning }) })
  },
)

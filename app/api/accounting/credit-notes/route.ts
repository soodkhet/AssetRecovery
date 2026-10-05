import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createCreditNote, listCreditNotes } from '@/lib/credit-notes/queries'
import { creditNoteCreateSchema, creditNoteListQuerySchema } from '@/lib/credit-notes/schemas'
import { MANAGE_TAX_INVOICE, SALES_READ_CAPABILITIES } from '@/lib/sales/sales'

/** `GET /api/accounting/credit-notes` — ทะเบียนใบลดหนี้ (รวมใบที่ยกเลิก) · บัญชี/การเงินดูได้ */
export const GET = withApiPermission(
  'view',
  SALES_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = creditNoteListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listCreditNotes(user, parsed.data))
  },
)

/**
 * `POST /api/accounting/credit-notes` (มติ PO 05/10/2569 U14) — **บันทึก**ใบลดหนี้/ใบเพิ่มหนี้ (U19) ที่สำนักงานบัญชีออกแล้ว
 * สิทธิ์ = `manage_tax_invoice` (บัญชี) เท่านั้น — การเงินที่ดูรายการขายได้บันทึกเอกสารภาษีไม่ได้
 */
export const POST = withApiPermission(
  'manage',
  MANAGE_TAX_INVOICE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = creditNoteCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await createCreditNote({ actor: user, meta: getRequestMeta(request) }, parsed.data))
  },
)

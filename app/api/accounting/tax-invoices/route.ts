import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { issueTaxInvoice, listTaxInvoices } from '@/lib/sales/queries'
import { MANAGE_TAX_INVOICE, SALES_READ_CAPABILITIES } from '@/lib/sales/sales'
import { taxInvoiceCreateSchema, taxInvoiceListQuerySchema } from '@/lib/sales/schemas'

/** `GET /api/accounting/tax-invoices` — ทะเบียนใบกำกับภาษี (รวมใบที่ยกเลิก เพื่อพิสูจน์ความต่อเนื่อง) */
export const GET = withApiPermission(
  'view',
  SALES_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = taxInvoiceListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listTaxInvoices(user, parsed.data))
  },
)

/**
 * `POST /api/accounting/tax-invoices` (`31` §14) — **ออก**ใบกำกับภาษี (สร้าง = active ทันที)
 *
 * สิทธิ์ = `manage_tax_invoice` ของบัญชีเท่านั้น (`25` §7.4) — การเงินที่มีสิทธิ์ดูรายการขายออก
 * เอกสารทางภาษีไม่ได้ · `invoice_number` ไม่รับจาก body ไม่ว่ากรณีใด (`31` §10)
 */
export const POST = withApiPermission(
  'manage',
  MANAGE_TAX_INVOICE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = taxInvoiceCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await issueTaxInvoice({ actor: user, meta: getRequestMeta(request) }, parsed.data))
  },
)

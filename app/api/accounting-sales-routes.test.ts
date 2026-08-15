import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import type { TaxInvoiceDocSource } from '@/lib/sales/sales'

/**
 * เทสต์ระดับ route ของบัญชีขาย/ใบกำกับภาษี/เงินรับ (ไฟล์ 31 §12/§14 · `28` §6.2)
 *
 * ตรวจสิ่งที่ pure module ตรวจแทนไม่ได้: capability ที่ผูกกับ endpoint (DEC-002 — **การเงินดูได้
 * แต่ออกเอกสารภาษีไม่ได้**), header ของไฟล์ PDF, **ฟอนต์ไทยฝังจริง** (ไม่ register = ตัวอักษรไทย
 * หายทั้งใบโดยไม่มี error) และการที่ **ไม่มีเส้นทางสร้างเงินรับด้วยมือ** (`31` §6.3/§10)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listSalesRecords: vi.fn(),
  listTaxInvoices: vi.fn(),
  issueTaxInvoice: vi.fn(),
  cancelTaxInvoice: vi.fn(),
  listCashReceipts: vi.fn(),
  getTaxInvoiceDocSource: vi.fn(),
  syncSalesRecordFromBilling: vi.fn(),
}))
vi.mock('@/lib/sales/queries', () => queriesMock)

const { GET: getSales } = await import('@/app/api/accounting/sales/route')
const { GET: getInvoices, POST: postInvoice } = await import('@/app/api/accounting/tax-invoices/route')
const { PATCH: cancelInvoice } = await import('@/app/api/accounting/tax-invoices/[id]/cancel/route')
const { GET: getInvoicePdf } = await import('@/app/api/accounting/tax-invoices/[id]/pdf/route')
const cashReceiptsRoute = await import('@/app/api/accounting/cash-receipts/route')

const INVOICE_ID = '00000000-0000-4000-8000-000000004301'
const SALES_ID = '00000000-0000-4000-8000-000000004302'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'accounting@example.com',
    fullName: 'บัญชี ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const ACCOUNTANT = sessionUser({ manage_tax_invoice: 'manage', manage_sales_expenses: 'manage' })
/** การเงิน = ดูรายการขาย/เงินรับได้ แต่ออกใบกำกับภาษีไม่ได้ (`25` §7.4/§7.5) */
const FINANCE = sessionUser({ manage_sales_expenses: 'view' })
const FIELD_AGENT = sessionUser({ perform_field_work: 'manage' })

function request(url: string, init?: RequestInit): NextRequest {
  const base = new Request(url, init) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

interface Envelope {
  success: boolean
  error: { code: string } | null
}

async function codeOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as Envelope).error?.code
}

function docSource(overrides: Partial<TaxInvoiceDocSource> = {}): TaxInvoiceDocSource {
  return {
    invoiceNumber: 'INV-0006',
    invoiceDate: new Date('2026-06-25T00:00:00Z'),
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    deliveryFormat: 'paper_pdf',
    seller: {
      name: 'บริษัท ใจดี โมบาย จำกัด',
      taxId: '0105512345678',
      address: '123 ถ.พระราม 1 กรุงเทพฯ',
      phone: '021234567',
    },
    buyer: {
      name: 'บริษัท สยามไฟแนนซ์ จำกัด',
      taxId: '0105512420001',
      address: '1 ถ.สีลม กรุงเทพฯ',
      phone: null,
    },
    description: 'ค่าบริการติดตามทรัพย์ รอบเดือน มิถุนายน 2569',
    periodLabel: 'มิถุนายน 2569',
    amounts: { totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 },
    vatRatesPct: ['7.00'],
    ...overrides,
  }
}

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const fn of Object.values(queriesMock)) fn.mockReset()
})

describe('สิทธิ์ของโมดูลบัญชีขาย (DEC-002 · `31` §12)', () => {
  it('ไม่มี capability ของบัญชีเลย = 403 ทุก endpoint', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const responses = await Promise.all([
      getSales(request('http://localhost/api/accounting/sales'), undefined),
      getInvoices(request('http://localhost/api/accounting/tax-invoices'), undefined),
      cashReceiptsRoute.GET(
        request('http://localhost/api/accounting/cash-receipts'),
        undefined,
      ),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(queriesMock.listSalesRecords).not.toHaveBeenCalled()
    expect(queriesMock.listCashReceipts).not.toHaveBeenCalled()
  })

  it('การเงินดูรายการขาย/เงินรับได้ (view) แต่ออกและยกเลิกใบกำกับภาษีไม่ได้ (403)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    queriesMock.listSalesRecords.mockResolvedValue({
      items: [],
      totalBeforeVatSatang: 0,
      vatSatang: 0,
      totalSatang: 0,
      awaitingInvoiceCount: 0,
    })

    const readable = await getSales(request('http://localhost/api/accounting/sales'), undefined)
    expect(readable.status).toBe(200)

    const issued = await postInvoice(
      request('http://localhost/api/accounting/tax-invoices', {
        method: 'POST',
        body: JSON.stringify({ salesRecordId: SALES_ID }),
        headers: { 'content-type': 'application/json' },
      }),
      undefined,
    )
    expect(issued.status).toBe(403)

    const cancelled = await cancelInvoice(
      request(`http://localhost/api/accounting/tax-invoices/${INVOICE_ID}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: 'ออกผิด' }),
        headers: { 'content-type': 'application/json' },
      }),
      params(INVOICE_ID),
    )
    expect(cancelled.status).toBe(403)
    expect(queriesMock.issueTaxInvoice).not.toHaveBeenCalled()
    expect(queriesMock.cancelTaxInvoice).not.toHaveBeenCalled()
  })
})

describe('ออก/ยกเลิกใบกำกับภาษี (`31` §14)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(ACCOUNTANT))

  it('body ที่พยายามกำหนดเลขที่เอง ⇒ เลขที่ถูกทิ้ง ระบบเดินเลขเองเสมอ (`31` §10)', async () => {
    queriesMock.issueTaxInvoice.mockResolvedValue({ id: INVOICE_ID, invoiceNumber: 'INV-0007' })

    const response = await postInvoice(
      request('http://localhost/api/accounting/tax-invoices', {
        method: 'POST',
        body: JSON.stringify({ salesRecordId: SALES_ID, invoiceNumber: 'INV-9999' }),
        headers: { 'content-type': 'application/json' },
      }),
      undefined,
    )

    expect(response.status).toBe(200)
    expect(queriesMock.issueTaxInvoice).toHaveBeenCalledWith(expect.anything(), { salesRecordId: SALES_ID })
  })

  it('salesRecordId ไม่ใช่ uuid ⇒ 400 VALIDATION_ERROR ไม่ถึงชั้น service', async () => {
    const response = await postInvoice(
      request('http://localhost/api/accounting/tax-invoices', {
        method: 'POST',
        body: JSON.stringify({ salesRecordId: 'ไม่ใช่ uuid' }),
        headers: { 'content-type': 'application/json' },
      }),
      undefined,
    )
    expect(response.status).toBe(400)
    expect(queriesMock.issueTaxInvoice).not.toHaveBeenCalled()
  })

  it('ยกเลิกส่งเหตุผลว่าง ⇒ CANCEL_REQUIRES_REASON จาก service (ไม่ใช่ field error)', async () => {
    const { SalesError } = await import('@/lib/sales/errors')
    queriesMock.cancelTaxInvoice.mockRejectedValue(new SalesError('CANCEL_REQUIRES_REASON'))

    const response = await cancelInvoice(
      request(`http://localhost/api/accounting/tax-invoices/${INVOICE_ID}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: '   ' }),
        headers: { 'content-type': 'application/json' },
      }),
      params(INVOICE_ID),
    )
    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('CANCEL_REQUIRES_REASON')
  })
})

describe('ใบกำกับภาษี PDF (`28` §6.2)', () => {
  it('ตอบไฟล์ PDF จริง + ฟอนต์ไทยฝังอยู่ + ไม่ cache + ชื่อไฟล์เป็นเลขที่เอกสาร', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    queriesMock.getTaxInvoiceDocSource.mockResolvedValue(docSource())

    const response = await getInvoicePdf(
      request(`http://localhost/api/accounting/tax-invoices/${INVOICE_ID}/pdf`),
      params(INVOICE_ID),
    )
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-disposition')).toContain('INV-0006.pdf')
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // ไม่ register ฟอนต์ = ตัวอักษรไทยหายทั้งใบ **โดยไม่มี error** (`28` §7)
    expect(body.toString('latin1')).toContain('NotoSansThai')
  })

  it('การเงิน (view) พิมพ์สำเนาได้ · ใบที่ยกเลิกแล้วยังพิมพ์ได้เพื่อเก็บเป็นหลักฐาน', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    queriesMock.getTaxInvoiceDocSource.mockResolvedValue(
      docSource({ status: 'cancelled', cancelReason: 'ออกผิดบริษัท', cancelledAt: new Date('2026-06-28T00:00:00Z') }),
    )

    const response = await getInvoicePdf(
      request(`http://localhost/api/accounting/tax-invoices/${INVOICE_ID}/pdf`),
      params(INVOICE_ID),
    )
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})

describe('เงินรับสร้างด้วยมือไม่ได้ (`31` §6.3/§10)', () => {
  it('route เงินรับมีแต่ GET — ไม่มี POST/PATCH/DELETE ให้เรียก', () => {
    expect(Object.keys(cashReceiptsRoute)).toEqual(['GET'])
  })

  it('route รายการขายมีแต่ GET — รายการขายเกิดจากการส่งบิลเท่านั้น (`31` §6.1)', async () => {
    const salesRoute = await import('@/app/api/accounting/sales/route')
    expect(Object.keys(salesRoute)).toEqual(['GET'])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { extractPdfText } from '@/components/pdf/extract-text'
import { SAMPLE_DOC_LABEL } from '@/components/pdf/sample-stamp'
import type { SessionUser } from '@/lib/auth/types'
import { DOCUMENT_NUMBER_DEFAULTS, DOCUMENT_NUMBER_TYPES, formatDocumentNumber } from '@/lib/document-numbering/format'
import type { DocumentNumberingDto } from '@/lib/document-numbering/types'
import type { DocumentSampleListItemDto } from '@/lib/documents/samples/catalog'

/**
 * เทสต์ระดับ route ของ "ตัวอย่างเอกสารทั้งหมด" (มติ PO U104)
 *
 * สิทธิ์ `view_document_samples` (บัญชี/การเงิน/บริหาร) ⇒ 200 · role อื่น ⇒ 403 · ชนิดที่ไม่รู้จัก ⇒ 400
 * · PDF ที่ได้มีป้ายตัวอย่าง + เลขถัดไปจากค่าตั้งเลขที่เอกสาร (ไม่ได้เรียกตัวเดินเลข)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))
vi.mock('@/lib/organization/letterhead', async () => (await import('@/tests/helpers/letterhead')).fakeLetterheadModule())

const numberingMock = vi.hoisted(() => ({
  listDocumentNumbering: vi.fn(),
  nextDocumentNumber: vi.fn(),
}))
vi.mock('@/lib/document-numbering/queries', () => numberingMock)

const listRoute = await import('@/app/api/accounting/document-samples/route')
const pdfRoute = await import('@/app/api/accounting/document-samples/[docType]/pdf/route')

function sessionUser(roleName: string, capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: `${roleName} ทดสอบ`,
    status: 'active',
    roleId: 'role-1',
    roleName,
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const ACCOUNTANT = sessionUser('บัญชี', { view_document_samples: 'view', manage_wht: 'manage' })
const FINANCE = sessionUser('การเงิน', { view_document_samples: 'view' })
const EXECUTIVE = sessionUser('บริหาร', { view_document_samples: 'view' })
const ADMIN_OFFICE = sessionUser('ธุรการ', { record_admin_data: 'manage', manage_users: 'manage' })
const FINANCE_WITHOUT = sessionUser('การเงิน', { manage_billing: 'manage' })

function numberingRow(docType: (typeof DOCUMENT_NUMBER_TYPES)[number]): DocumentNumberingDto {
  const format = DOCUMENT_NUMBER_DEFAULTS[docType]
  return {
    docType,
    label: docType,
    issuedWhen: '',
    isTaxDocument: false,
    ...format,
    currentSeq: 41,
    currentYear: 2569,
    lastIssuedNumber: null,
    lastIssuedAt: null,
    pattern: `${format.prefix}-pattern`,
    nextNumberPreview: formatDocumentNumber(format, 42, 2569),
    minNextSequence: 42,
    issuedCount: null,
    formatLocked: false,
    updatedAt: new Date().toISOString(),
  }
}

function request(url: string): NextRequest {
  const base = new Request(url) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (docType: string) => ({ params: Promise.resolve({ docType }) })

beforeEach(() => {
  requireSessionMock.mockReset()
  numberingMock.listDocumentNumbering.mockReset()
  numberingMock.nextDocumentNumber.mockReset()
  numberingMock.listDocumentNumbering.mockResolvedValue(DOCUMENT_NUMBER_TYPES.map(numberingRow))
})

describe('GET /api/accounting/document-samples', () => {
  it.each([
    ['บัญชี', ACCOUNTANT],
    ['การเงิน', FINANCE],
    ['บริหาร', EXECUTIVE],
  ])('%s (ถือ view_document_samples) ⇒ 200 + ครบทุกชนิด + เลขตัวอย่างตามค่าตั้ง', async (_label, user) => {
    requireSessionMock.mockResolvedValue(user)
    const response = await listRoute.GET(request('http://localhost/api/accounting/document-samples'), undefined)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: DocumentSampleListItemDto[] }
    expect(body.data).toHaveLength(13)
    expect(body.data.find((item) => item.type === 'receipt-tax-invoice')?.sampleNumber).toBe('INV-0042')
    expect(body.data.find((item) => item.type === 'pack-cover')?.sampleNumber).toBeNull()
    expect(numberingMock.nextDocumentNumber).not.toHaveBeenCalled()
  })

  it.each([
    ['ธุรการ', ADMIN_OFFICE],
    ['การเงินที่ถูกถอนสิทธิ์', FINANCE_WITHOUT],
  ])('%s ⇒ 403', async (_label, user) => {
    requireSessionMock.mockResolvedValue(user)
    const response = await listRoute.GET(request('http://localhost/api/accounting/document-samples'), undefined)
    expect(response.status).toBe(403)
  })
})

describe('GET /api/accounting/document-samples/:docType/pdf', () => {
  it('การเงินที่ถือสิทธิ์ ⇒ 200 PDF · ป้ายตัวอย่าง · เลขถัดไป · ไม่เรียกตัวเดินเลข', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    const response = await pdfRoute.GET(
      request('http://localhost/api/accounting/document-samples/receipt-tax-invoice/pdf'),
      params('receipt-tax-invoice'),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('receipt-tax-invoice.pdf')
    const text = extractPdfText(new Uint8Array(await response.arrayBuffer())).replace(/\n/g, '')
    expect(text).toContain(SAMPLE_DOC_LABEL)
    expect(text).toContain('INV-0042')
    expect(numberingMock.nextDocumentNumber).not.toHaveBeenCalled()
  }, 30_000)

  it('ธุรการ ⇒ 403 (ไม่เรนเดอร์)', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const response = await pdfRoute.GET(
      request('http://localhost/api/accounting/document-samples/billing-invoice/pdf'),
      params('billing-invoice'),
    )
    expect(response.status).toBe(403)
    expect(numberingMock.listDocumentNumbering).not.toHaveBeenCalled()
  })

  it('ชนิดที่ไม่รู้จัก ⇒ 400 พร้อมช่องที่ผิด', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    const response = await pdfRoute.GET(
      request('http://localhost/api/accounting/document-samples/real-invoice/pdf'),
      params('real-invoice'),
    )
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { fields?: Record<string, string> } }
    expect(body.error.fields?.docType).toBeDefined()
  })
})

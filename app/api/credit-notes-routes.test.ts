import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของใบลดหนี้ (มติ PO U14) — capability ที่ผูกกับ endpoint (DEC-002):
 * บัญชี (`manage_tax_invoice`) บันทึก/ยกเลิกได้ · การเงินดูได้อย่างเดียว · ผู้บริหารที่ไม่มีสิทธิ์รายการขายเห็นแค่ป้าย "รอใบลดหนี้"
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listCreditNotes: vi.fn(),
  createCreditNote: vi.fn(),
  cancelCreditNote: vi.fn(),
  listAdjustmentsAwaitingCreditNote: vi.fn(),
}))
vi.mock('@/lib/credit-notes/queries', () => queriesMock)

const { GET: listRoute, POST: createRoute } = await import('@/app/api/accounting/credit-notes/route')
const { PATCH: cancelRoute } = await import('@/app/api/accounting/credit-notes/[id]/cancel/route')
const { GET: awaitingRoute } = await import('@/app/api/accounting/credit-notes/awaiting/route')

const INVOICE_ID = '00000000-0000-4000-8000-0000000c4b01'
const NOTE_ID = '00000000-0000-4000-8000-0000000c4b02'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'u@example.com',
    fullName: 'ผู้ใช้ ทดสอบ',
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
const FINANCE = sessionUser({ manage_sales_expenses: 'view', create_adjustment: 'manage', approve_adjustment: 'manage' })
const EXECUTIVE = sessionUser({ approve_adjustment: 'manage' })
const FIELD_AGENT = sessionUser({ perform_field_work: 'manage' })

function request(url: string, init?: RequestInit): NextRequest {
  const base = new Request(url, init) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const BASE = 'http://localhost/api/accounting/credit-notes'

const body = {
  taxInvoiceId: INVOICE_ID,
  creditNoteNumber: 'CN-0001',
  issueDate: '2026-10-05',
  amountBeforeVatSatang: 10_000,
  reason: 'ลดค่าบริการ',
}

async function codeOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { error: { code: string } | null }).error?.code
}

beforeEach(() => {
  vi.clearAllMocks()
  queriesMock.listCreditNotes.mockResolvedValue({ items: [] })
  queriesMock.createCreditNote.mockResolvedValue({ id: NOTE_ID })
  queriesMock.cancelCreditNote.mockResolvedValue({ id: NOTE_ID })
  queriesMock.listAdjustmentsAwaitingCreditNote.mockResolvedValue([])
})

describe('POST /api/accounting/credit-notes', () => {
  it('บัญชีบันทึกได้ — วันที่แปลงเป็น DATE (เที่ยงคืน UTC)', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    const response = await createRoute(request(BASE, { method: 'POST', body: JSON.stringify(body) }), {})
    expect(response.status).toBe(200)
    const input = queriesMock.createCreditNote.mock.calls[0]?.[1] as { issueDate: Date }
    expect(input.issueDate.toISOString()).toBe('2026-10-05T00:00:00.000Z')
  })

  it.each([
    ['การเงิน', FINANCE],
    ['ผู้บริหาร', EXECUTIVE],
    ['ภาคสนาม', FIELD_AGENT],
  ])('%s บันทึกไม่ได้ ⇒ 403', async (_label, user) => {
    requireSessionMock.mockResolvedValue(user)
    const response = await createRoute(request(BASE, { method: 'POST', body: JSON.stringify(body) }), {})
    expect(response.status).toBe(403)
    expect(queriesMock.createCreditNote).not.toHaveBeenCalled()
  })

  it('ยอดไม่ใช่จำนวนเต็มสตางค์ / ไม่มีเหตุผล ⇒ 400 field errors', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    const bad = await createRoute(
      request(BASE, { method: 'POST', body: JSON.stringify({ ...body, amountBeforeVatSatang: 100.5, reason: '' }) }),
      {},
    )
    expect(bad.status).toBe(400)
    expect(queriesMock.createCreditNote).not.toHaveBeenCalled()
  })
})

describe('GET /api/accounting/credit-notes', () => {
  it('การเงินดูทะเบียนได้', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    expect((await listRoute(request(`${BASE}?taxInvoiceId=${INVOICE_ID}`), {})).status).toBe(200)
  })

  it('ผู้บริหารที่ไม่มีสิทธิ์รายการขาย / ภาคสนาม ⇒ 403', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    expect((await listRoute(request(BASE), {})).status).toBe(403)
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    expect((await listRoute(request(BASE), {})).status).toBe(403)
  })
})

describe('PATCH /api/accounting/credit-notes/:id/cancel', () => {
  it('บัญชียกเลิกได้ · การเงิน 403 · ไม่มี reason ⇒ 400', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    const ok = await cancelRoute(
      request(`${BASE}/${NOTE_ID}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'ผิด' }) }),
      params(NOTE_ID),
    )
    expect(ok.status).toBe(200)

    const missing = await cancelRoute(
      request(`${BASE}/${NOTE_ID}/cancel`, { method: 'PATCH', body: JSON.stringify({}) }),
      params(NOTE_ID),
    )
    expect(missing.status).toBe(400)

    requireSessionMock.mockResolvedValue(FINANCE)
    const denied = await cancelRoute(
      request(`${BASE}/${NOTE_ID}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'ผิด' }) }),
      params(NOTE_ID),
    )
    expect(denied.status).toBe(403)
    expect(await codeOf(denied)).toBe('PERMISSION_DENIED')
  })
})

describe('GET /api/accounting/credit-notes/awaiting', () => {
  it('ผู้เห็นหน้า Adjustment (ผู้บริหาร/การเงิน) และบัญชีเห็นป้าย · ภาคสนาม 403', async () => {
    for (const user of [ACCOUNTANT, FINANCE, EXECUTIVE]) {
      requireSessionMock.mockResolvedValue(user)
      expect((await awaitingRoute(request(`${BASE}/awaiting`), {})).status).toBe(200)
    }
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    expect((await awaitingRoute(request(`${BASE}/awaiting`), {})).status).toBe(403)
  })
})

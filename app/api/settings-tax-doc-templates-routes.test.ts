import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของแท็บ "เทมเพลตเอกสาร" (`13` §6.13 · มติ PO U122) — ใช้ `requirePermission()` ตัวจริง (mock แค่ session)
 *  · ดู = `view_master_data` · แก้ = `manage_tax_profiles` (ล็อก Superadmin) + เหตุผล
 *  · ช่องที่ตัดออกแล้ว (โลโก้/ลายเซ็น URL/ขนาดกระดาษ/ภาษา) และชนิด 50 ทวิ ⇒ 400 ไม่แตะชั้นข้อมูล
 * การเขียน DB + audit + snapshot อยู่ใน `lib/organization/organization.db.test.ts` / `lib/sales/sales.db.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listTaxDocTemplates: vi.fn(),
  organizationHasSignature: vi.fn(),
  updateTaxDocTemplate: vi.fn(),
  getTaxDocTemplate: vi.fn(),
  loadDocumentTemplateSnapshot: vi.fn(),
}))
vi.mock('@/lib/settings/queries/tax-doc-templates', () => queriesMock)

const route = await import('@/app/api/settings/tax-document-templates/route')

const ORG_ID = '00000000-0000-4000-8000-000000009911'

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    organizationId: ORG_ID,
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const SUPERADMIN = sessionUser({ id: 'sa-1', roleName: 'Superadmin', isSuperadmin: true })
const ACCOUNTING = sessionUser({ id: 'acc-1', capabilities: { view_master_data: 'view', manage_settings: 'manage' } })

const VALID = {
  documentType: 'billing_invoice',
  footerNote: 'โปรดชำระภายในกำหนด',
  printSignature: true,
  reason: 'เพิ่มเงื่อนไขการชำระเงิน',
}

function request(method: string, body?: unknown): NextRequest {
  const url = 'http://localhost/api/settings/tax-document-templates'
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

interface Envelope {
  data?: { templates?: unknown[]; hasSignature?: boolean; legallyRequiredFields?: string[] }
  error?: { code: string; fields?: Record<string, string> } | null
}

beforeEach(() => {
  vi.clearAllMocks()
  requireSessionMock.mockReset()
})

describe('GET/PATCH /api/settings/tax-document-templates (มติ PO U122)', () => {
  it('GET: 3 ชนิด + สถานะรูปลายเซ็น + ฟิลด์บังคับตามกฎหมาย', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    queriesMock.listTaxDocTemplates.mockResolvedValue([{}, {}, {}])
    queriesMock.organizationHasSignature.mockResolvedValue(true)
    const response = await route.GET(request('GET'), undefined)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Envelope
    expect(body.data?.templates).toHaveLength(3)
    expect(body.data?.hasSignature).toBe(true)
    expect(body.data?.legallyRequiredFields?.length).toBeGreaterThan(0)
  })

  it('PATCH: Superadmin บันทึกได้ — ส่งเฉพาะข้อความท้าย + สวิตช์ลายเซ็น + เหตุผลลงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.updateTaxDocTemplate.mockResolvedValue({ documentType: 'billing_invoice' })
    const response = await route.PATCH(request('PATCH', VALID), undefined)
    expect(response.status).toBe(200)
    const [context, documentType, values] = queriesMock.updateTaxDocTemplate.mock.calls[0] as [
      { reason: string },
      string,
      Record<string, unknown>,
    ]
    expect(context.reason).toBe(VALID.reason)
    expect(documentType).toBe('billing_invoice')
    expect(values).toEqual({ footerNote: 'โปรดชำระภายในกำหนด', printSignature: true })
  })

  it('PATCH: บัญชี (ไม่มี manage_tax_profiles) ⇒ 403', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    expect((await route.PATCH(request('PATCH', VALID), undefined)).status).toBe(403)
    expect(queriesMock.updateTaxDocTemplate).not.toHaveBeenCalled()
  })

  it.each([
    [{ logoUrl: 'https://cdn.example.com/logo.png' }],
    [{ signatureImageUrl: 'https://cdn.example.com/sign.png' }],
    [{ paperSize: 'A5' }],
    [{ language: 'th_en_bilingual' }],
    [{ documentType: 'wht_certificate' }],
    [{ reason: '' }],
    [{ footerNote: 'ก'.repeat(501) }],
  ])('PATCH body %j ⇒ 400 · ไม่แตะชั้นข้อมูล', async (patch) => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const response = await route.PATCH(request('PATCH', { ...VALID, ...patch }), undefined)
    expect(response.status).toBe(400)
    expect(((await response.json()) as Envelope).error).toBeTruthy()
    expect(queriesMock.updateTaxDocTemplate).not.toHaveBeenCalled()
  })
})

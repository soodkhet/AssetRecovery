import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * route เอกสารบริษัทไฟแนนซ์ (มติ PO U132) — ดู = `view_master_data` · แนบ = `manage_companies` (Superadmin)
 * · body ผ่าน Zod ชุดเดียวกับฟอร์ม (หนังสือรับรองต้องมีวันที่ออก)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listCompanyDocuments: vi.fn(),
  createCompanyDocument: vi.fn(),
  MANAGE_COMPANIES: 'manage_companies',
  VIEW_COMPANY_DOCUMENTS: 'view_master_data',
}))
vi.mock('@/lib/finance-companies/document-queries', () => queriesMock)

const route = await import('@/app/api/finance-companies/[id]/documents/route')

const COMPANY_ID = '00000000-0000-4000-8000-0000001321c1'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>, isSuperadmin = false): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'admin@example.com',
    fullName: 'ผู้ใช้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: isSuperadmin ? 'Superadmin' : 'การเงิน',
    roleGroup: 'system',
    isSuperadmin,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const SUPERADMIN = sessionUser({}, true)
const FINANCE = sessionUser({ view_master_data: 'view' })

function request(method: 'GET' | 'POST', body?: unknown): NextRequest {
  const url = `http://localhost/api/finance-companies/${COMPANY_ID}/documents`
  const base = new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: COMPANY_ID }) }

const body = {
  documentType: 'company_certificate',
  issuedDate: '2026-09-01',
  path: `finance-companies/${COMPANY_ID}/documents/certificate/x.pdf`,
  originalName: 'cert.pdf',
  reason: 'แนบหนังสือรับรองฉบับใหม่',
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.listCompanyDocuments.mockReset()
  queriesMock.createCompanyDocument.mockReset()
})

describe('GET/POST /api/finance-companies/:id/documents', () => {
  it('การเงิน (view_master_data) ดูรายการได้', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    queriesMock.listCompanyDocuments.mockResolvedValue({ companyId: COMPANY_ID, documents: [], warnings: [] })
    const response = await route.GET(request('GET'), params)
    expect(response.status).toBe(200)
  })

  it('การเงินแนบเอกสารไม่ได้ (403) · service ไม่ถูกเรียก', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    const response = await route.POST(request('POST', body), params)
    expect(response.status).toBe(403)
    expect(queriesMock.createCompanyDocument).not.toHaveBeenCalled()
  })

  it('Superadmin แนบได้ · หนังสือรับรองไม่มีวันที่ออก = 400', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.createCompanyDocument.mockResolvedValue({ id: 'doc-1' })
    const ok = await route.POST(request('POST', body), params)
    expect(ok.status).toBe(201)
    expect(queriesMock.createCompanyDocument.mock.calls[0]?.[2]).toMatchObject({
      documentType: 'company_certificate',
      replacesDocumentId: null,
    })

    const bad = await route.POST(request('POST', { ...body, issuedDate: '' }), params)
    expect(bad.status).toBe(400)
  })
})

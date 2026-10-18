import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * `POST /api/finance-companies/:id/status` — ระงับบริษัทไม่กรอกเหตุผล ⇒ 400 `SUSPEND_REASON_REQUIRED`
 * (`10` §11 · §16 "ระงับบริษัทไม่กรอกเหตุผล") ไม่ใช่ `REQUIRED_MISSING` กลาง (mytester7 S7-AG2-06)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getFinanceCompany: vi.fn(),
  setFinanceCompanyStatus: vi.fn(),
}))
vi.mock('@/lib/finance-companies/queries', () => queriesMock)

const route = await import('@/app/api/finance-companies/[id]/status/route')

const COMPANY_ID = '00000000-0000-4000-8000-0000007a2061'

const SUPERADMIN: SessionUser = {
  id: 'user-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'admin@example.com',
  fullName: 'ผู้ดูแลระบบ',
  status: 'active',
  roleId: 'role-1',
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
  loginAt: new Date().toISOString(),
}

function request(body: unknown): NextRequest {
  const url = `http://localhost/api/finance-companies/${COMPANY_ID}/status`
  const base = new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: COMPANY_ID }) }

async function codeOf(response: Response): Promise<string | undefined> {
  const json = (await response.json()) as { error?: { code?: string } }
  return json.error?.code
}

beforeEach(() => {
  requireSessionMock.mockReset()
  requireSessionMock.mockResolvedValue(SUPERADMIN)
  queriesMock.getFinanceCompany.mockReset()
  queriesMock.setFinanceCompanyStatus.mockReset()
})

describe('POST /api/finance-companies/:id/status', () => {
  it.each([
    ['เหตุผลว่าง', { status: 'suspended', reason: '' }],
    ['ช่องว่างล้วน', { status: 'suspended', reason: '   ' }],
    ['ไม่ส่งเหตุผล', { status: 'suspended' }],
  ])('ระงับ — %s ⇒ 400 SUSPEND_REASON_REQUIRED · service ไม่ถูกเรียก', async (_label, body) => {
    const response = await route.POST(request(body), params)
    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('SUSPEND_REASON_REQUIRED')
    expect(queriesMock.setFinanceCompanyStatus).not.toHaveBeenCalled()
  })

  it('ระงับด้วยเหตุผลสั้นเกิน ⇒ REQUIRED_MISSING + ข้อความรายช่องเหมือนเดิม', async () => {
    const response = await route.POST(request({ status: 'suspended', reason: 'สั้น' }), params)
    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('REQUIRED_MISSING')
  })

  it('ระงับพร้อมเหตุผล ⇒ เรียก service', async () => {
    queriesMock.getFinanceCompany.mockResolvedValue({ id: COMPANY_ID })
    queriesMock.setFinanceCompanyStatus.mockResolvedValue({ id: COMPANY_ID, status: 'suspended' })
    const response = await route.POST(request({ status: 'suspended', reason: 'ค้างชำระเกิน 90 วัน' }), params)
    expect(response.status).toBe(200)
    expect(queriesMock.setFinanceCompanyStatus).toHaveBeenCalledTimes(1)
  })
})

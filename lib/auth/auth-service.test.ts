import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * login — ผู้ใช้บริษัทเมื่อบริษัทถูกระงับ (มติ PO 05/10/2569 O43 D5 · `97` §12/§20) + ปลายทางพอร์ทัล (D2)
 * และผู้ใช้ปิดใช้งาน (`05` §10 · `97` §20)
 */

const signInMock = vi.hoisted(() => vi.fn())
const signOutMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword: signInMock, signOut: signOutMock } }),
}))

vi.mock('@/lib/users/provisioning', () => ({
  getAuthEmail: async () => 'manager@finance.example',
  verifyPassword: async () => false,
  setAuthPassword: async () => undefined,
}))

const loadSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ loadSessionUser: loadSessionUserMock, getAuthenticatedUid: vi.fn() }))

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), update: vi.fn() },
  organization: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const emitAuditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audit/audit', () => ({ emitAudit: emitAuditMock }))

const loadCompanyStatusMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/company-status', () => ({
  loadCompanyStatus: loadCompanyStatusMock,
  isCompanyActive: (status: string | null) => status === 'active',
}))

const { login } = await import('@/lib/auth/auth-service')

const ORG = '00000000-0000-4000-8000-0000000000aa'
const COMPANY = '00000000-0000-4000-8000-00000000000a'
const META = { ipAddress: '10.0.0.1', userAgent: 'vitest' }

function account(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '00000000-0000-4000-8000-0000000000u1',
    organizationId: ORG,
    supabaseUid: 'uid-1',
    email: 'manager@finance.example',
    fullName: 'ผู้จัดการ บริษัท',
    status: 'active',
    roleId: 'r-1',
    roleName: 'ผู้จัดการ',
    roleGroup: 'finance_company',
    isSuperadmin: false,
    teamId: null,
    companyId: COMPANY,
    capabilities: { portal_cases: 'view' },
    scope: { kind: 'company', teamIds: [], companyId: COMPANY, userId: 'u1' },
    loginAt: null,
    mustChangePassword: false,
    ...overrides,
  }
}

async function loginError(): Promise<AuthError> {
  const error = await login({ identifier: 'manager@finance.example', password: 'secret' }, META).then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AuthError)
  return error as AuthError
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findFirst.mockResolvedValue({ organizationId: ORG, supabaseUid: 'uid-1' })
  prismaMock.user.update.mockResolvedValue({})
  signInMock.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })
  signOutMock.mockResolvedValue({ error: null })
  emitAuditMock.mockResolvedValue(undefined)
  loadCompanyStatusMock.mockResolvedValue('active')
})

describe('login — ผู้ใช้บริษัทไฟแนนซ์', () => {
  it('บริษัทถูกระงับ → COMPANY_SUSPENDED 403 · signOut · audit login failed', async () => {
    loadSessionUserMock.mockResolvedValue(account())
    loadCompanyStatusMock.mockResolvedValue('suspended')

    const error = await loginError()
    expect(error.code).toBe('COMPANY_SUSPENDED')
    expect(error.status).toBe(403)
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(loadCompanyStatusMock).toHaveBeenCalledWith(ORG, COMPANY)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(emitAuditMock).toHaveBeenCalledTimes(1)
    expect(emitAuditMock.mock.calls[0]?.[0]).toMatchObject({
      action: 'login',
      targetType: 'users',
      after: { result: 'failed', code: 'COMPANY_SUSPENDED', company_id: COMPANY, company_status: 'suspended' },
    })
  })

  it('บริษัท active → login สำเร็จ ไป /portal (ไม่ใช่ /dashboard)', async () => {
    loadSessionUserMock.mockResolvedValue(account())
    const result = await login({ identifier: 'manager@finance.example', password: 'secret' }, META)
    expect(result.redirectTo).toBe('/portal')
    expect(signOutMock).not.toHaveBeenCalled()
    expect(emitAuditMock.mock.calls.at(-1)?.[0]).toMatchObject({ action: 'login', after: { result: 'success' } })
  })

  it('ผู้ใช้บริษัทถูกปิดใช้ → ACCOUNT_INACTIVE (ตรวจก่อนสถานะบริษัท · §20)', async () => {
    loadSessionUserMock.mockResolvedValue(account({ status: 'suspended' }))
    loadCompanyStatusMock.mockResolvedValue('suspended')
    const error = await loginError()
    expect(error.code).toBe('ACCOUNT_INACTIVE')
    expect(loadCompanyStatusMock).not.toHaveBeenCalled()
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })
})

describe('login — ผู้ใช้ภายใน', () => {
  it('ไม่ตรวจสถานะบริษัท และไป /dashboard', async () => {
    loadSessionUserMock.mockResolvedValue(
      account({ roleName: 'การเงิน', roleGroup: 'system', companyId: null, capabilities: {} }),
    )
    const result = await login({ identifier: 'finance', password: 'secret' }, META)
    expect(result.redirectTo).toBe('/dashboard')
    expect(loadCompanyStatusMock).not.toHaveBeenCalled()
  })
})

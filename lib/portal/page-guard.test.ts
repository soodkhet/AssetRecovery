import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'

/**
 * ยามหน้า `/portal` + หน้าภายใน (มติ PO 05/10/2569 U6/O43 D2/D5/D11 · R10v3-N1 — เดิม `/portal` เปิดได้ทุก session)
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to)
  },
}))

const getSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getSessionUser: getSessionUserMock }))

const loadCompanyStatusMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/company-status', () => ({
  loadCompanyStatus: loadCompanyStatusMock,
  isCompanyActive: (status: string | null) => status === 'active',
}))

const { requirePortalPage } = await import('@/lib/portal/page-guard')
const { requireInternalSessionPage } = await import('@/lib/auth/page-guard')

const COMPANY_ID = '00000000-0000-4000-8000-00000000000a'

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'u-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: null,
    fullName: 'ผู้ใช้',
    status: 'active',
    roleId: 'r-1',
    roleName: 'แอดมิน',
    roleGroup: 'finance_company',
    isSuperadmin: false,
    teamId: null,
    companyId: COMPANY_ID,
    capabilities: { portal_cases: 'view', portal_profile: 'view' },
    scope: { kind: 'company', teamIds: [], companyId: COMPANY_ID, userId: 'u-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const INTERNAL = user({ roleName: 'ธุรการ', roleGroup: 'system', companyId: null, capabilities: { record_admin_data: 'manage' } })
const SUPERADMIN = user({ roleName: 'Superadmin', roleGroup: 'system', isSuperadmin: true, companyId: null, capabilities: {} })

async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    if (error instanceof RedirectSignal) return error.to
    throw error
  }
}

beforeEach(() => {
  getSessionUserMock.mockReset()
  loadCompanyStatusMock.mockReset()
  loadCompanyStatusMock.mockResolvedValue('active')
})

describe('requirePortalPage', () => {
  it('ไม่มี session → หน้า login', async () => {
    getSessionUserMock.mockResolvedValue(null)
    expect(await redirectOf(requirePortalPage())).toBe('/login')
  })

  it('ผู้ใช้ภายในเปิด /portal → /dashboard', async () => {
    getSessionUserMock.mockResolvedValue(INTERNAL)
    expect(await redirectOf(requirePortalPage())).toBe('/dashboard')
  })

  it('Superadmin เปิด /portal → /dashboard (D11)', async () => {
    getSessionUserMock.mockResolvedValue(SUPERADMIN)
    expect(await redirectOf(requirePortalPage())).toBe('/dashboard')
  })

  it('บริษัทถูกระงับ → หน้า login พร้อมเหตุผล COMPANY_SUSPENDED', async () => {
    getSessionUserMock.mockResolvedValue(user())
    loadCompanyStatusMock.mockResolvedValue('suspended')
    expect(await redirectOf(requirePortalPage())).toBe('/login?reason=COMPANY_SUSPENDED')
  })

  it('ไม่มีสิทธิ์หมวด → หน้าแรกพอร์ทัล', async () => {
    getSessionUserMock.mockResolvedValue(user())
    expect(await redirectOf(requirePortalPage('finance'))).toBe('/portal')
  })

  it('ผู้ใช้บริษัทที่มีสิทธิ์ → ผ่าน', async () => {
    const viewer = user()
    getSessionUserMock.mockResolvedValue(viewer)
    await expect(requirePortalPage()).resolves.toBe(viewer)
    await expect(requirePortalPage('cases')).resolves.toBe(viewer)
  })
})

describe('requireInternalSessionPage', () => {
  it('ผู้ใช้บริษัทเปิดหน้าภายใน → /portal (D2)', async () => {
    getSessionUserMock.mockResolvedValue(user())
    expect(await redirectOf(requireInternalSessionPage())).toBe('/portal')
  })

  it('ผู้ใช้ภายใน → ผ่าน', async () => {
    getSessionUserMock.mockResolvedValue(INTERNAL)
    await expect(requireInternalSessionPage()).resolves.toBe(INTERNAL)
  })
})

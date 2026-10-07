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

const getAuthEmailMock = vi.hoisted(() => vi.fn())
const verifyPasswordMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/users/provisioning', () => ({
  getAuthEmail: getAuthEmailMock,
  verifyPassword: verifyPasswordMock,
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

// preship PS-009 — ค่าเริ่มต้นไม่ถูกพัก · เทสต์ของการพักตั้งค่าเอง
const loginThrottledMock = vi.hoisted(() => vi.fn(async () => false))
vi.mock('@/lib/auth/login-throttle-queries', () => ({ loginThrottled: loginThrottledMock }))

const { login } = await import('@/lib/auth/auth-service')
const { LOGIN_FAILURE_MIN_DURATION_MS, remainingLoginDelayMs } = await import('@/lib/auth/login-timing')

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
  prismaMock.organization.findFirst.mockResolvedValue({ id: ORG })
  getAuthEmailMock.mockResolvedValue('manager@finance.example')
  verifyPasswordMock.mockResolvedValue(false)
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

describe('login — เวลาตอบไม่บอกใบ้ว่าบัญชีมีจริง (UAT BUG-140 · มติ PO U64)', () => {
  /** นาฬิกาปลอม — `advance` จำลองเวลาที่ Auth/DB ใช้ · `sleep` บันทึกเวลาที่ถูกถ่วงเพิ่ม */
  function fakeClock() {
    let now = 1_000_000
    const sleeps: number[] = []
    return {
      sleeps,
      advance: (ms: number) => {
        now += ms
      },
      clock: {
        now: () => now,
        sleep: async (ms: number) => {
          sleeps.push(ms)
          now += ms
        },
      },
    }
  }

  async function failedLogin(clock: { now: () => number; sleep: (ms: number) => Promise<void> }): Promise<AuthError> {
    const error = await login({ identifier: 'ghost', password: 'wrong-password' }, META, clock).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(AuthError)
    return error as AuthError
  }

  it('ไม่พบบัญชี → INVALID_CREDENTIALS · เรียก Auth ครบเท่าทางปกติ · ถ่วงจนครบเวลาขั้นต่ำ · audit ยังลง', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    const fake = fakeClock()
    verifyPasswordMock.mockImplementation(async () => {
      fake.advance(60)
      return false
    })
    const error = await failedLogin(fake.clock)
    expect(error.code).toBe('INVALID_CREDENTIALS')
    expect(getAuthEmailMock).toHaveBeenCalledTimes(1)
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1)
    expect(fake.sleeps).toEqual([LOGIN_FAILURE_MIN_DURATION_MS - 60])
    expect(emitAuditMock).toHaveBeenCalledTimes(1)
    expect(emitAuditMock.mock.calls[0]?.[0]).toMatchObject({ after: { result: 'failed', code: 'INVALID_CREDENTIALS' } })
  })

  it('บัญชีมีจริงแต่รหัสผิด → ถ่วงจนครบเวลาขั้นต่ำเดียวกัน', async () => {
    const fake = fakeClock()
    signInMock.mockImplementation(async () => {
      fake.advance(210)
      return { data: { user: null }, error: { message: 'Invalid login credentials' } }
    })
    const error = await failedLogin(fake.clock)
    expect(error.code).toBe('INVALID_CREDENTIALS')
    expect(fake.sleeps).toEqual([LOGIN_FAILURE_MIN_DURATION_MS - 210])
  })

  it('ทำงานนานเกินขั้นต่ำแล้ว → ไม่ถ่วงเพิ่ม', async () => {
    const fake = fakeClock()
    signInMock.mockImplementation(async () => {
      fake.advance(LOGIN_FAILURE_MIN_DURATION_MS + 50)
      return { data: { user: null }, error: { message: 'Invalid login credentials' } }
    })
    await failedLogin(fake.clock)
    expect(fake.sleeps).toEqual([])
  })

  it('login สำเร็จ / error หลังรหัสผ่านถูก (ACCOUNT_INACTIVE) ไม่ถูกถ่วง', async () => {
    const fake = fakeClock()
    loadSessionUserMock.mockResolvedValue(account())
    await login({ identifier: 'manager@finance.example', password: 'secret' }, META, fake.clock)
    loadSessionUserMock.mockResolvedValue(account({ status: 'suspended' }))
    const error = await login({ identifier: 'manager@finance.example', password: 'secret' }, META, fake.clock).then(
      () => null,
      (e: unknown) => e,
    )
    expect((error as AuthError).code).toBe('ACCOUNT_INACTIVE')
    expect(fake.sleeps).toEqual([])
  })

  it('remainingLoginDelayMs ไม่ติดลบ', () => {
    expect(remainingLoginDelayMs(0, 100, 800)).toBe(700)
    expect(remainingLoginDelayMs(0, 900, 800)).toBe(0)
  })
})

describe('login — พักเมื่อผิดซ้ำเกินเพดาน (preship PS-009)', () => {
  it('ถูกพัก ⇒ LOGIN_RATE_LIMITED 429 · ไม่เรียก Supabase เลย · audit ลง code นี้', async () => {
    prismaMock.user.findFirst.mockResolvedValue(account())
    loginThrottledMock.mockResolvedValueOnce(true)

    const error = await loginError()

    expect(error.code).toBe('LOGIN_RATE_LIMITED')
    expect(error.status).toBe(429)
    expect(getAuthEmailMock).not.toHaveBeenCalled()
    expect(signInMock).not.toHaveBeenCalled()
    expect(loginThrottledMock).toHaveBeenCalledWith({
      organizationId: ORG,
      identifier: 'manager@finance.example',
      ipAddress: META.ipAddress,
    })
    expect(emitAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login', after: expect.objectContaining({ result: 'failed', code: 'LOGIN_RATE_LIMITED' }) }),
    )
  })

  it('บัญชีที่ไม่มีจริงก็ถูกพักด้วยข้อความเดียวกัน (ไม่ leak ว่ามีบัญชีไหม)', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.organization.findFirst.mockResolvedValue({ id: ORG })
    loginThrottledMock.mockResolvedValueOnce(true)

    const error = await loginError()

    expect(error.code).toBe('LOGIN_RATE_LIMITED')
    expect(signInMock).not.toHaveBeenCalled()
  })
})

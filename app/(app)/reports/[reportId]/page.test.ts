import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'

/**
 * UAT BUG-133 — เปิด `/reports/{slug}` โดยไม่มีสิทธิ์หมวดนั้น เคย throw `AuthError` ระหว่าง render
 * (หน้า error 500) ⇒ ต้องเด้งกลับหน้ารวมรายงานแบบเดียวกับหน้าอื่นที่ไม่มีสิทธิ์ ไม่ render อะไรของรายงาน
 */

class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super(`NEXT_REDIRECT:${path}`)
  }
}

const redirectMock = vi.hoisted(() => vi.fn())
const notFoundMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ redirect: redirectMock, notFound: notFoundMock }))

const requireMenuPageMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/nav/menu-guard', () => ({ requireMenuPage: requireMenuPageMock }))

vi.mock('@/components/reports/report-screen', () => ({ ReportScreen: () => null }))

const { default: ReportPage } = await import('@/app/(app)/reports/[reportId]/page')

function user(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'u-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'u@example.com',
    fullName: 'ผู้ใช้ทดสอบ',
    status: 'active',
    roleId: 'role-x',
    roleName: 'การเงิน',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'u-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const params = (reportId: string) => ({ params: Promise.resolve({ reportId }) })

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((path: string) => {
    throw new RedirectSignal(path)
  })
  notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
})

describe('หน้า /reports/[reportId] — ไม่มีสิทธิ์หมวดรายงาน (BUG-133)', () => {
  it('ผู้ใช้ที่ไม่มีสิทธิ์หมวด E → redirect ไป /reports (ไม่ throw AuthError)', async () => {
    requireMenuPageMock.mockResolvedValue(user({}))
    await expect(ReportPage(params('kpi-summary'))).rejects.toMatchObject({ path: '/reports' })
    expect(redirectMock).toHaveBeenCalledWith('/reports')
  })

  it('Superadmin เปิดได้ตามปกติ', async () => {
    requireMenuPageMock.mockResolvedValue(user({ isSuperadmin: true, roleName: 'Superadmin', roleGroup: 'system' }))
    await expect(ReportPage(params('kpi-summary'))).resolves.toBeTruthy()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('slug ที่ไม่มีอยู่ → notFound', async () => {
    requireMenuPageMock.mockResolvedValue(user({}))
    await expect(ReportPage(params('no-such-report'))).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'

/**
 * ยามหน้า `/portal/view-as/[companyId]/**` + audit การเปิดโหมด (มติ PO 05/10/2569 U59 · `97` §13.1)
 */

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`)
  }
}
class NotFoundSignal extends Error {}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to)
  },
  notFound: () => {
    throw new NotFoundSignal('not-found')
  },
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '10.0.0.9', 'user-agent': 'vitest' }) }))

const getSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getSessionUser: getSessionUserMock }))

const emitAuditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audit/audit', () => ({ emitAudit: emitAuditMock }))

const findCompanyMock = vi.hoisted(() => vi.fn())
const findAuditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({
  prisma: { financeCompany: { findFirst: findCompanyMock }, auditLog: { findFirst: findAuditMock } },
}))

const { requirePortalViewAsPage, recordPortalViewAsOpen, pageRequestMeta } = await import('@/lib/portal/view-as-page')

const ORG = '00000000-0000-4000-8000-0000000000aa'
const COMPANY = '00000000-0000-4000-8000-00000000000a'
const LOGIN_AT = '2026-10-05T01:00:00.000Z'

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '00000000-0000-4000-8000-0000000000s1',
    organizationId: ORG,
    supabaseUid: 'uid-1',
    email: null,
    fullName: 'ธุรการ',
    status: 'active',
    roleId: 'r-1',
    roleName: 'ธุรการ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { view_client_portal_as: 'view' },
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 's1' },
    loginAt: LOGIN_AT,
    ...overrides,
  }
}

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'ok'
  } catch (error) {
    if (error instanceof RedirectSignal) return `redirect:${error.to}`
    if (error instanceof NotFoundSignal) return 'not-found'
    throw error
  }
}

beforeEach(() => {
  getSessionUserMock.mockReset()
  emitAuditMock.mockReset()
  findCompanyMock.mockReset()
  findAuditMock.mockReset()
  emitAuditMock.mockResolvedValue(undefined)
  findCompanyMock.mockResolvedValue({ id: COMPANY, name: 'ไฟแนนซ์ ก', status: 'active' })
  findAuditMock.mockResolvedValue(null)
})

describe('requirePortalViewAsPage', () => {
  it('ผู้ใช้ภายในที่มีสิทธิ์ → คืนบริษัท (ค้นใน org ของผู้ดูเท่านั้น)', async () => {
    getSessionUserMock.mockResolvedValue(user())
    const page = await requirePortalViewAsPage(COMPANY)
    expect(page.company).toEqual({ id: COMPANY, name: 'ไฟแนนซ์ ก', status: 'active' })
    expect(findCompanyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: COMPANY, organizationId: ORG, deletedAt: null } }))
  })

  it('บริษัทถูกระงับ → ยังเปิดได้', async () => {
    getSessionUserMock.mockResolvedValue(user())
    findCompanyMock.mockResolvedValue({ id: COMPANY, name: 'ไฟแนนซ์ ก', status: 'suspended' })
    expect(await outcome(requirePortalViewAsPage(COMPANY))).toBe('ok')
  })

  it('ผู้ใช้บริษัท → portal ของตัวเอง (path นี้ไม่มีผล) · ภายในไม่มีสิทธิ์ → dashboard', async () => {
    getSessionUserMock.mockResolvedValue(
      user({ roleGroup: 'finance_company', companyId: '00000000-0000-4000-8000-00000000000b', roleName: 'ผู้จัดการ' }),
    )
    expect(await outcome(requirePortalViewAsPage(COMPANY))).toBe('redirect:/portal')
    getSessionUserMock.mockResolvedValue(user({ roleName: 'การเงิน', capabilities: {} }))
    expect(await outcome(requirePortalViewAsPage(COMPANY))).toBe('redirect:/dashboard')
    expect(findCompanyMock).not.toHaveBeenCalled()
  })

  it('id มั่ว / ไม่มีบริษัทใน org → 404', async () => {
    getSessionUserMock.mockResolvedValue(user())
    expect(await outcome(requirePortalViewAsPage('abc'))).toBe('not-found')
    findCompanyMock.mockResolvedValue(null)
    expect(await outcome(requirePortalViewAsPage(COMPANY))).toBe('not-found')
  })

  it('ไม่มี session → หน้า login', async () => {
    getSessionUserMock.mockResolvedValue(null)
    expect(await outcome(requirePortalViewAsPage(COMPANY))).toBe('redirect:/login')
  })
})

describe('recordPortalViewAsOpen — audit ครั้งแรกต่อ session ต่อบริษัท', () => {
  const company = { id: COMPANY, name: 'ไฟแนนซ์ ก', status: 'suspended' }

  it('ยังไม่เคยเปิดใน session นี้ → audit view_as ระบุผู้ดู + บริษัท + สถานะ (ไม่มี reason)', async () => {
    await expect(recordPortalViewAsOpen(user(), company, await pageRequestMeta())).resolves.toBe(true)
    expect(findAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: user().id,
          action: 'view_as',
          targetType: 'finance_companies',
          targetId: COMPANY,
          createdAt: { gte: new Date(LOGIN_AT) },
        }),
      }),
    )
    const entry = (emitAuditMock.mock.calls.at(-1) as [Record<string, unknown>])[0]
    expect(entry).toMatchObject({
      action: 'view_as',
      actorId: user().id,
      actorRole: 'ธุรการ',
      targetType: 'finance_companies',
      targetId: COMPANY,
      ipAddress: '10.0.0.9',
      userAgent: 'vitest',
    })
    expect(entry.after).toMatchObject({ mode: 'view_as', company_id: COMPANY, company_status: 'suspended' })
    expect(entry.reason).toBeUndefined()
  })

  it('เปิดแล้วใน session เดิม → ไม่ลงซ้ำ', async () => {
    findAuditMock.mockResolvedValue({ id: 'a-1' })
    await expect(recordPortalViewAsOpen(user(), company)).resolves.toBe(false)
    expect(emitAuditMock).not.toHaveBeenCalled()
  })

  it('audit ล้ม → หน้าไม่พัง (คืน false)', async () => {
    emitAuditMock.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(recordPortalViewAsOpen(user(), company)).resolves.toBe(false)
    spy.mockRestore()
  })
})

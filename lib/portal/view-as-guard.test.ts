import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'
import { PORTAL_VIEW_AS_CAPABILITIES } from '@/lib/portal/view-as'

/**
 * ยาม `/api/portal/*` ในโหมด "ดู portal ในฐานะลูกค้า" (มติ PO 05/10/2569 U59 · `97` §13.1)
 * — `?as=<companyId>` resolve บริษัทได้เฉพาะผู้ใช้ภายในที่มีสิทธิ์ + บริษัทใน org เดียวกัน
 */

const getRawSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getRawSessionUser: getRawSessionUserMock }))

const loadCompanyStatusMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/company-status', () => ({ loadCompanyStatus: loadCompanyStatusMock }))

const emitAuditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audit/audit', () => ({ emitAudit: emitAuditMock }))

const findCompanyMock = vi.hoisted(() => vi.fn())
const findAuditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({
  prisma: { financeCompany: { findFirst: findCompanyMock }, auditLog: { findFirst: findAuditMock } },
}))

const { requirePortalAccess, requirePortalRow, portalScopedUser, portalViewAsAuditFields } = await import('@/lib/portal/guard')

const ORG = '00000000-0000-4000-8000-0000000000aa'
const COMPANY_A = '00000000-0000-4000-8000-00000000000a'
const COMPANY_B = '00000000-0000-4000-8000-00000000000b'
const ROW_ID = '00000000-0000-4000-8000-0000000000c1'

function staff(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '00000000-0000-4000-8000-0000000000s1',
    organizationId: ORG,
    supabaseUid: 'uid-staff',
    email: null,
    fullName: 'ธุรการ ทดสอบ',
    status: 'active',
    roleId: 'role-admin-office',
    roleName: 'ธุรการ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { view_client_portal_as: 'view' },
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'x' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const COMPANY_USER = staff({
  id: '00000000-0000-4000-8000-0000000000u1',
  roleName: 'ผู้จัดการ',
  roleGroup: 'finance_company',
  companyId: COMPANY_A,
  capabilities: { portal_cases: 'view', portal_finance: 'view', portal_download: 'view', view_client_portal_as: 'view' },
  scope: { kind: 'company', teamIds: [], companyId: COMPANY_A, userId: 'u1' },
})

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AuthError)
  expect((error as AuthError).code).toBe(code)
}

function lastAudit(): Record<string, unknown> {
  const call = emitAuditMock.mock.calls.at(-1)
  expect(call).toBeDefined()
  return (call as [Record<string, unknown>])[0]
}

beforeEach(() => {
  getRawSessionUserMock.mockReset()
  loadCompanyStatusMock.mockReset()
  emitAuditMock.mockReset()
  findCompanyMock.mockReset()
  findAuditMock.mockReset()
  findAuditMock.mockResolvedValue(null)
  loadCompanyStatusMock.mockResolvedValue('active')
  emitAuditMock.mockResolvedValue(undefined)
  findCompanyMock.mockResolvedValue({ id: COMPANY_A, name: 'ไฟแนนซ์ A', status: 'active' })
})

describe('requirePortalAccess — ?as=<companyId>', () => {
  it('ผู้ใช้ภายในที่มีสิทธิ์ → context ของบริษัทนั้น สิทธิ์เท่าผู้จัดการ (ทุกหมวด + ดาวน์โหลด) · ลง audit เปิดโหมด (U141)', async () => {
    const viewer = staff()
    getRawSessionUserMock.mockResolvedValue(viewer)
    const ctx = await requirePortalAccess('finance', { download: true, request: req(`/api/portal/tax-invoices?as=${COMPANY_A}`) })
    expect(ctx).toEqual({
      user: viewer,
      companyId: COMPANY_A,
      capabilities: PORTAL_VIEW_AS_CAPABILITIES,
      section: 'finance',
      viewAs: { companyId: COMPANY_A, companyStatus: 'active' },
    })
    // ค้นบริษัทใน org ของผู้ดูเท่านั้น (บริษัทข้าม org = ไม่พบ)
    expect(findCompanyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COMPANY_A, organizationId: ORG, deletedAt: null } }),
    )
    // เรียก API ตรงก็ลง audit view_as (มติ PO U141) — ตัวเดียวกับหน้า view-as
    expect(emitAuditMock).toHaveBeenCalledTimes(1)
    expect(lastAudit()).toMatchObject({ action: 'view_as', targetType: 'finance_companies', targetId: COMPANY_A, actorId: viewer.id })
  })

  it('เปิดโหมดซ้ำใน session เดิม (มีแถว view_as แล้ว) → ไม่ลง audit ซ้ำ (U141)', async () => {
    getRawSessionUserMock.mockResolvedValue(staff())
    findAuditMock.mockResolvedValue({ id: 'audit-1' })
    await requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_A}`) })
    expect(emitAuditMock).not.toHaveBeenCalled()
  })

  it('audit เปิดโหมดล้ม → การดูยังผ่าน (GET ล้วน)', async () => {
    getRawSessionUserMock.mockResolvedValue(staff())
    emitAuditMock.mockRejectedValue(new Error('db down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const ctx = await requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_A}`) })
    expect(ctx.companyId).toBe(COMPANY_A)
    errorSpy.mockRestore()
  })

  it('Superadmin (โดยนิยาม) เปิดดูได้', async () => {
    getRawSessionUserMock.mockResolvedValue(staff({ isSuperadmin: true, roleName: 'Superadmin', capabilities: {} }))
    const ctx = await requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_A}`) })
    expect(ctx.companyId).toBe(COMPANY_A)
  })

  it('บริษัทถูกระงับ → ยังดูได้ (เพื่อช่วยลูกค้า) · สถานะติดไปกับ context', async () => {
    getRawSessionUserMock.mockResolvedValue(staff())
    findCompanyMock.mockResolvedValue({ id: COMPANY_A, status: 'suspended' })
    const ctx = await requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_A}`) })
    expect(ctx.viewAs).toEqual({ companyId: COMPANY_A, companyStatus: 'suspended' })
    expect(loadCompanyStatusMock).not.toHaveBeenCalled()
  })

  it('ผู้ใช้ภายในไม่มีสิทธิ์ → 403 + audit cause view_as_missing_capability', async () => {
    getRawSessionUserMock.mockResolvedValue(staff({ roleName: 'การเงิน', capabilities: { portal_finance: 'view' } }))
    await expectCode(requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_A}`) }), 'PERMISSION_DENIED')
    expect(lastAudit()).toMatchObject({ action: 'access_denied', targetType: 'portal' })
    expect(lastAudit().after).toMatchObject({ cause: 'view_as_missing_capability', mode: 'view_as', view_as_company_id: COMPANY_A })
    expect(findCompanyMock).not.toHaveBeenCalled()
  })

  it('ผู้ใช้บริษัทจริงส่ง as (บริษัทอื่นหรือของตัวเอง) → 403 ห้ามใช้ข้ามบริษัท แม้ถูกผูก capability นี้', async () => {
    getRawSessionUserMock.mockResolvedValue(COMPANY_USER)
    for (const target of [COMPANY_B, COMPANY_A]) {
      await expectCode(requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${target}`) }), 'PERMISSION_DENIED')
      expect(lastAudit().after).toMatchObject({ cause: 'view_as_by_company_user', company_id: COMPANY_A, view_as_company_id: target })
    }
    expect(findCompanyMock).not.toHaveBeenCalled()
  })

  it('id มั่ว / ค่าว่าง → 403 view_as_company_not_found โดยไม่ query', async () => {
    getRawSessionUserMock.mockResolvedValue(staff())
    for (const raw of ['not-a-uuid', '']) {
      await expectCode(requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${raw}`) }), 'PERMISSION_DENIED')
      expect(lastAudit().after).toMatchObject({ cause: 'view_as_company_not_found' })
    }
    expect(findCompanyMock).not.toHaveBeenCalled()
  })

  it('uuid ที่ไม่มีใน org (ข้าม org/ถูกลบ) → 403 view_as_company_not_found', async () => {
    getRawSessionUserMock.mockResolvedValue(staff())
    findCompanyMock.mockResolvedValue(null)
    await expectCode(requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_B}`) }), 'PERMISSION_DENIED')
    expect(lastAudit().after).toMatchObject({ cause: 'view_as_company_not_found', view_as_company_id: COMPANY_B })
  })

  it('ผู้ดูถูกปิดใช้ → ACCOUNT_INACTIVE · ต้องเปลี่ยนรหัส → PASSWORD_CHANGE_REQUIRED', async () => {
    getRawSessionUserMock.mockResolvedValue(staff({ status: 'suspended' }))
    await expectCode(requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_A}`) }), 'ACCOUNT_INACTIVE')
    getRawSessionUserMock.mockResolvedValue(staff({ mustChangePassword: true }))
    await expectCode(requirePortalAccess('cases', { request: req(`/api/portal/cases?as=${COMPANY_A}`) }), 'PASSWORD_CHANGE_REQUIRED')
  })

  it('ไม่ส่ง as → พฤติกรรมเดิม (ผู้ใช้ภายใน 403 not_company_user · ผู้ใช้บริษัทได้บริษัทตัวเอง)', async () => {
    getRawSessionUserMock.mockResolvedValue(staff())
    await expectCode(requirePortalAccess('cases', { request: req('/api/portal/cases') }), 'PERMISSION_DENIED')
    expect(lastAudit().after).toMatchObject({ cause: 'not_company_user' })

    getRawSessionUserMock.mockResolvedValue(COMPANY_USER)
    const ctx = await requirePortalAccess('cases', { request: req('/api/portal/cases') })
    expect(ctx.companyId).toBe(COMPANY_A)
    expect(ctx.viewAs).toBeUndefined()
  })
})

describe('ขอบเขตแถวในโหมดดูแทน', () => {
  it('แถวของบริษัทอื่น → 403 cross_company + audit ระบุบริษัทที่เปิดดู', async () => {
    getRawSessionUserMock.mockResolvedValue(staff())
    const ctx = await requirePortalAccess('cases', { request: req(`/api/portal/cases/${ROW_ID}?as=${COMPANY_A}`) })
    const own = { companyId: COMPANY_A }
    await expect(requirePortalRow(ctx, own, { type: 'cases', id: ROW_ID })).resolves.toBe(own)
    await expectCode(requirePortalRow(ctx, { companyId: COMPANY_B }, { type: 'cases', id: ROW_ID }), 'PERMISSION_DENIED')
    expect(lastAudit().after).toMatchObject({ cause: 'cross_company', mode: 'view_as', view_as_company_id: COMPANY_A })
  })

  it('audit ดาวน์โหลด + ผู้ใช้สำหรับ service ภายในบังคับ scope เป็นบริษัทที่เปิดดู', async () => {
    getRawSessionUserMock.mockResolvedValue(staff({ scope: { kind: 'team', teamIds: ['t1'], companyId: null, userId: 's1' } }))
    const ctx = await requirePortalAccess('finance', { download: true, request: req(`/api/portal/x?as=${COMPANY_A}`) })
    expect(portalViewAsAuditFields(ctx)).toEqual({ mode: 'view_as', view_as: true, viewer_role_group: 'system' })
    expect(portalScopedUser(ctx).scope).toEqual({ kind: 'company', teamIds: [], companyId: COMPANY_A, userId: ctx.user.id })

    getRawSessionUserMock.mockResolvedValue(COMPANY_USER)
    loadCompanyStatusMock.mockResolvedValue('active')
    const own = await requirePortalAccess('finance', { download: true, request: req('/api/portal/x') })
    expect(portalViewAsAuditFields(own)).toEqual({})
    expect(portalScopedUser(own)).toBe(COMPANY_USER)
  })
})

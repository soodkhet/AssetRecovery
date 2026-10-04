import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * ยาม `/api/portal/*` — ลำดับตรวจ `97` §17 + audit `access_denied` (§14) · มติ PO 05/10/2569 O43 D2/D3/D4/D5/D11
 */

const getRawSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getRawSessionUser: getRawSessionUserMock }))

const loadCompanyStatusMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/company-status', () => ({ loadCompanyStatus: loadCompanyStatusMock }))

const emitAuditMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/audit/audit', () => ({ emitAudit: emitAuditMock }))

const { requirePortalAccess, requirePortalRow, withPortal, PORTAL_AUDIT_TARGET } = await import('@/lib/portal/guard')

const COMPANY_A = '00000000-0000-4000-8000-00000000000a'
const COMPANY_B = '00000000-0000-4000-8000-00000000000b'
const ROW_ID = '00000000-0000-4000-8000-0000000000c1'

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  const id = overrides.id ?? '00000000-0000-4000-8000-0000000000u1'
  return {
    id,
    organizationId: '00000000-0000-4000-8000-0000000000aa',
    supabaseUid: `uid-${id}`,
    email: null,
    fullName: 'ผู้ใช้ บริษัท',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ผู้จัดการ',
    roleGroup: 'finance_company',
    isSuperadmin: false,
    teamId: null,
    companyId: COMPANY_A,
    capabilities: {
      portal_cases: 'view',
      portal_finance: 'view',
      portal_handover: 'view',
      portal_profile: 'view',
      portal_download: 'view',
    },
    scope: { kind: 'company', teamIds: [], companyId: COMPANY_A, userId: id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const INTERNAL = user({
  roleName: 'การเงิน',
  roleGroup: 'system',
  companyId: null,
  capabilities: { manage_billing: 'manage', portal_finance: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'x' },
})
const SUPERADMIN = user({
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'x' },
})

async function expectCode(promise: Promise<unknown>, code: string, status: number): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AuthError)
  expect((error as AuthError).code).toBe(code)
  expect((error as AuthError).status).toBe(status)
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
  loadCompanyStatusMock.mockResolvedValue('active')
  emitAuditMock.mockResolvedValue(undefined)
})

describe('requirePortalAccess — ลำดับตรวจ `97` §17', () => {
  it('ไม่มี session → 401 UNAUTHENTICATED ไม่ลง audit', async () => {
    getRawSessionUserMock.mockResolvedValue(null)
    await expectCode(requirePortalAccess('cases'), 'UNAUTHENTICATED', 401)
    expect(emitAuditMock).not.toHaveBeenCalled()
  })

  it('session หมดอายุ → 401 SESSION_EXPIRED', async () => {
    getRawSessionUserMock.mockResolvedValue(user({ loginAt: '2020-01-01T00:00:00Z' }))
    await expectCode(requirePortalAccess('cases'), 'SESSION_EXPIRED', 401)
    expect(emitAuditMock).not.toHaveBeenCalled()
  })

  it('ผู้ใช้ภายใน (ถึงถือ portal_finance) → 403 PERMISSION_DENIED + audit access_denied (D2)', async () => {
    getRawSessionUserMock.mockResolvedValue(INTERNAL)
    await expectCode(requirePortalAccess('finance'), 'PERMISSION_DENIED', 403)
    expect(loadCompanyStatusMock).not.toHaveBeenCalled()
    const audit = lastAudit()
    expect(audit).toMatchObject({ action: 'access_denied', targetType: PORTAL_AUDIT_TARGET, targetId: null, actorId: INTERNAL.id })
    expect(audit.after).toMatchObject({ code: 'PERMISSION_DENIED', section: 'finance', cause: 'not_company_user' })
    expect(audit.reason).toBeUndefined()
  })

  it('Superadmin → 403 PERMISSION_DENIED (D11)', async () => {
    getRawSessionUserMock.mockResolvedValue(SUPERADMIN)
    await expectCode(requirePortalAccess('cases'), 'PERMISSION_DENIED', 403)
    expect(lastAudit().action).toBe('access_denied')
  })

  it('ผู้ใช้บริษัทถูกปิดใช้ → 403 ACCOUNT_INACTIVE + audit (§20)', async () => {
    getRawSessionUserMock.mockResolvedValue(user({ status: 'suspended' }))
    await expectCode(requirePortalAccess('cases'), 'ACCOUNT_INACTIVE', 403)
    expect(lastAudit().after).toMatchObject({ code: 'ACCOUNT_INACTIVE' })
  })

  it('ผู้ใช้ปิดใช้ + บริษัทระงับ → ACCOUNT_INACTIVE มาก่อน', async () => {
    getRawSessionUserMock.mockResolvedValue(user({ status: 'suspended' }))
    loadCompanyStatusMock.mockResolvedValue('suspended')
    await expectCode(requirePortalAccess('cases'), 'ACCOUNT_INACTIVE', 403)
  })

  it('บริษัทถูกระงับระหว่าง login อยู่ → 403 COMPANY_SUSPENDED ทุก request + audit (§20)', async () => {
    getRawSessionUserMock.mockResolvedValue(user())
    loadCompanyStatusMock.mockResolvedValue('suspended')
    await expectCode(requirePortalAccess('cases'), 'COMPANY_SUSPENDED', 403)
    await expectCode(requirePortalAccess('profile'), 'COMPANY_SUSPENDED', 403)
    expect(loadCompanyStatusMock).toHaveBeenCalledTimes(2)
    expect(loadCompanyStatusMock).toHaveBeenCalledWith(user().organizationId, COMPANY_A)
    expect(lastAudit().after).toMatchObject({ code: 'COMPANY_SUSPENDED', cause: 'company_status:suspended' })
  })

  it('บริษัทถูกลบ/ไม่ได้ผูกบริษัท → COMPANY_SUSPENDED (ปิดไว้ก่อน)', async () => {
    getRawSessionUserMock.mockResolvedValue(user({ companyId: null }))
    loadCompanyStatusMock.mockResolvedValue(null)
    await expectCode(requirePortalAccess('cases'), 'COMPANY_SUSPENDED', 403)
  })

  it('ไม่มี capability ของหมวด → 403 PERMISSION_DENIED + audit (D1 — หัวหน้าเรียกการเงิน)', async () => {
    getRawSessionUserMock.mockResolvedValue(
      user({ roleName: 'หัวหน้า', capabilities: { portal_cases: 'view', portal_handover: 'view', portal_profile: 'view' } }),
    )
    await expectCode(requirePortalAccess('finance'), 'PERMISSION_DENIED', 403)
    expect(lastAudit().after).toMatchObject({ code: 'PERMISSION_DENIED', section: 'finance', cause: 'missing_capability' })
  })

  it('ดาวน์โหลดโดยไม่มี portal_download → 403', async () => {
    getRawSessionUserMock.mockResolvedValue(user({ capabilities: { portal_handover: 'view' } }))
    await expectCode(requirePortalAccess('handover', { download: true }), 'PERMISSION_DENIED', 403)
    expect(lastAudit().after).toMatchObject({ download: true })
  })

  it('ต้องเปลี่ยนรหัสผ่านก่อน → 403 PASSWORD_CHANGE_REQUIRED', async () => {
    getRawSessionUserMock.mockResolvedValue(user({ mustChangePassword: true }))
    await expectCode(requirePortalAccess('cases'), 'PASSWORD_CHANGE_REQUIRED', 403)
  })

  it('ผ่าน → คืน context { user, companyId, capabilities, section } ไม่ลง audit', async () => {
    const viewer = user()
    getRawSessionUserMock.mockResolvedValue(viewer)
    const ctx = await requirePortalAccess('handover', { download: true })
    expect(ctx).toEqual({ user: viewer, companyId: COMPANY_A, capabilities: viewer.capabilities, section: 'handover' })
    expect(emitAuditMock).not.toHaveBeenCalled()
  })

  it('audit ล้มไม่ทำให้ 403 กลายเป็น error อื่น', async () => {
    getRawSessionUserMock.mockResolvedValue(INTERNAL)
    emitAuditMock.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expectCode(requirePortalAccess('cases'), 'PERMISSION_DENIED', 403)
    spy.mockRestore()
  })

  it('บันทึก endpoint (ไม่มี query string) + ip/user-agent จาก request', async () => {
    getRawSessionUserMock.mockResolvedValue(INTERNAL)
    const request = new NextRequest('http://localhost/api/portal/cases?search=0812345678', {
      headers: { 'x-forwarded-for': '10.0.0.5', 'user-agent': 'vitest' },
    })
    await expectCode(requirePortalAccess('cases', { request }), 'PERMISSION_DENIED', 403)
    const audit = lastAudit()
    expect(audit.after).toMatchObject({ endpoint: 'GET /api/portal/cases' })
    expect(audit).toMatchObject({ ipAddress: '10.0.0.5', userAgent: 'vitest' })
  })
})

describe('requirePortalRow — id สุ่ม/ข้ามบริษัท = 403 แบบเดียวกัน (D3)', () => {
  async function ctx() {
    getRawSessionUserMock.mockResolvedValue(user())
    return requirePortalAccess('cases')
  }

  it('แถวของบริษัทตัวเอง → คืนแถว', async () => {
    const portal = await ctx()
    const row = { id: ROW_ID, companyId: COMPANY_A }
    await expect(requirePortalRow(portal, row, { type: 'cases', id: ROW_ID })).resolves.toBe(row)
    expect(emitAuditMock).not.toHaveBeenCalled()
  })

  it('แถวของบริษัทอื่น → 403 PERMISSION_DENIED + audit cross_company (target = แถวที่ร้องขอ)', async () => {
    const portal = await ctx()
    await expectCode(requirePortalRow(portal, { companyId: COMPANY_B }, { type: 'cases', id: ROW_ID }), 'PERMISSION_DENIED', 403)
    const audit = lastAudit()
    expect(audit).toMatchObject({ action: 'access_denied', targetType: 'cases', targetId: ROW_ID })
    expect(audit.after).toMatchObject({ cause: 'cross_company', section: 'cases' })
  })

  it('ไม่พบแถว (uuid สุ่ม) → 403 PERMISSION_DENIED ไม่ใช่ 404 + audit row_not_found', async () => {
    const portal = await ctx()
    await expectCode(requirePortalRow(portal, null, { type: 'cases', id: ROW_ID }), 'PERMISSION_DENIED', 403)
    expect(lastAudit().after).toMatchObject({ cause: 'row_not_found' })
  })

  it('id ไม่ใช่ uuid → target_id = null และเก็บ id ดิบใน after', async () => {
    const portal = await ctx()
    await expectCode(requirePortalRow(portal, undefined, { type: 'cases', id: 'abc' }), 'PERMISSION_DENIED', 403)
    const audit = lastAudit()
    expect(audit.targetId).toBeNull()
    expect(audit.after).toMatchObject({ requested_id: 'abc' })
  })

  it('แถวที่ company_id เป็น null → 403', async () => {
    const portal = await ctx()
    await expectCode(requirePortalRow(portal, { companyId: null }, { type: 'assets', id: ROW_ID }), 'PERMISSION_DENIED', 403)
  })
})

describe('withPortal — ห่อ route GET', () => {
  it('ไม่มีสิทธิ์ → response 403 รูปแบบมาตรฐาน · ผ่าน → เรียก handler พร้อม context', async () => {
    const handler = vi.fn(async (_req: NextRequest, _ctx: unknown, portal: { companyId: string }) =>
      Response.json({ companyId: portal.companyId }),
    )
    const route = withPortal('finance', {}, handler)

    getRawSessionUserMock.mockResolvedValue(SUPERADMIN)
    const denied = await route(new NextRequest('http://localhost/api/portal/billing-batches'), {})
    expect(denied.status).toBe(403)
    expect(((await denied.json()) as { error: { code: string } }).error.code).toBe('PERMISSION_DENIED')
    expect(handler).not.toHaveBeenCalled()
    expect(lastAudit().after).toMatchObject({ endpoint: 'GET /api/portal/billing-batches' })

    getRawSessionUserMock.mockResolvedValue(user())
    const ok = await route(new NextRequest('http://localhost/api/portal/billing-batches'), {})
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ companyId: COMPANY_A })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import type { CapabilityInfo } from '@/lib/roles/matrix'

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getRole: vi.fn(),
  getRoleAssignments: vi.fn(),
  listCapabilities: vi.fn(),
  applyRolePermissionChanges: vi.fn(),
}))
vi.mock('@/lib/roles/queries', () => queriesMock)

const { GET, PATCH } = await import('@/app/api/roles/[id]/permissions/route')

const CAPABILITIES: CapabilityInfo[] = [
  { code: 'manage_billing', label: 'จัดการ Billing', module: 'billing', functionalGroup: 'finance', description: null },
  { code: 'unlock_period', label: 'ปลดล็อกรอบ', module: 'accounting', functionalGroup: 'accounting', description: null },
  { code: 'view_master_data', label: 'ดู Master Data', module: 'master_data', functionalGroup: 'admin', description: null },
]

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  const base: SessionUser = {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'superadmin@example.com',
    fullName: 'ผู้ดูแลระบบ',
    status: 'active',
    roleId: 'role-superadmin',
    roleName: SUPERADMIN_ROLE_NAME,
    roleGroup: 'system',
    isSuperadmin: true,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: resolveScope({
      userId: 'user-1',
      roleGroup: 'system',
      roleName: SUPERADMIN_ROLE_NAME,
      teamId: null,
      companyId: null,
      managedTeamIds: [],
      supervisedTeamIds: [],
    }),
    loginAt: new Date().toISOString(),
  }
  return { ...base, ...overrides }
}

function patchRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/roles/role-1/permissions', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const context = { params: Promise.resolve({ id: 'role-1' }) }
const customRole = {
  id: 'role-1',
  name: 'ผู้ตรวจสอบภายใน',
  roleGroup: 'system' as const,
  isSeed: false,
  isEditable: true,
  userCount: 0,
}

interface ErrorBody {
  error: { code: string; fields?: Record<string, string> }
}

describe('PATCH /api/roles/:id/permissions (`07` §14 · DEC-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionMock.mockResolvedValue(session())
    queriesMock.getRole.mockResolvedValue(customRole)
    queriesMock.listCapabilities.mockResolvedValue(CAPABILITIES)
    queriesMock.getRoleAssignments.mockResolvedValue({})
    queriesMock.applyRolePermissionChanges.mockResolvedValue(undefined)
  })

  it('บันทึกเฉพาะรายการที่เปลี่ยนจริง พร้อม reason', async () => {
    const response = await PATCH(
      patchRequest({
        entries: [{ capabilityCode: 'manage_billing', level: 'manage' }],
        reason: 'มอบสิทธิ์ตามมติที่ประชุม 14/08/2569',
      }),
      { params: Promise.resolve({ id: 'role-1' }) },
    )

    expect(response.status).toBe(200)
    expect(queriesMock.applyRolePermissionChanges).toHaveBeenCalledTimes(1)

    const [ctx, role, changes] = queriesMock.applyRolePermissionChanges.mock.calls[0] as [
      { reason: string },
      { id: string },
      Array<{ code: string; from: string; to: string }>,
    ]
    expect(ctx.reason).toBe('มอบสิทธิ์ตามมติที่ประชุม 14/08/2569')
    expect(role.id).toBe('role-1')
    expect(changes).toEqual([{ code: 'manage_billing', from: 'none', to: 'manage' }])
  })

  it('capability ที่ล็อก ("✅ only") มอบให้ role อื่นไม่ได้ → CAPABILITY_LOCKED', async () => {
    const response = await PATCH(
      patchRequest({
        entries: [{ capabilityCode: 'unlock_period', level: 'manage' }],
        reason: 'ขอมอบสิทธิ์ปลดล็อกรอบให้ทีมตรวจสอบ',
      }),
      context,
    )

    expect(response.status).toBe(400)
    expect(((await response.json()) as ErrorBody).error.code).toBe('CAPABILITY_LOCKED')
    expect(queriesMock.applyRolePermissionChanges).not.toHaveBeenCalled()
  })

  it('role ที่ is_editable = false แก้ไม่ได้ → ROLE_NOT_EDITABLE', async () => {
    queriesMock.getRole.mockResolvedValue({ ...customRole, isSeed: true, isEditable: false, name: 'การเงิน' })

    const response = await PATCH(
      patchRequest({
        entries: [{ capabilityCode: 'manage_billing', level: 'view' }],
        reason: 'ปรับสิทธิ์ตามคำขอฝ่ายการเงิน',
      }),
      context,
    )

    expect(response.status).toBe(400)
    expect(((await response.json()) as ErrorBody).error.code).toBe('ROLE_NOT_EDITABLE')
  })

  it('ไม่ส่ง reason = 400 REQUIRED_MISSING (กระทบสิทธิ์ต้องมีเหตุผลเสมอ — `90` §13)', async () => {
    const response = await PATCH(
      patchRequest({ entries: [{ capabilityCode: 'manage_billing', level: 'view' }] }),
      context,
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as ErrorBody
    expect(body.error.code).toBe('REQUIRED_MISSING')
    expect(body.error.fields).toHaveProperty('reason')
    expect(queriesMock.applyRolePermissionChanges).not.toHaveBeenCalled()
  })

  it('capability ที่ไม่มีในระบบ → CAPABILITY_NOT_FOUND', async () => {
    const response = await PATCH(
      patchRequest({
        entries: [{ capabilityCode: 'ยิงมั่ว', level: 'manage' }],
        reason: 'ทดสอบรหัสที่ไม่มีจริง',
      }),
      context,
    )

    expect(response.status).toBe(400)
    expect(((await response.json()) as ErrorBody).error.code).toBe('CAPABILITY_NOT_FOUND')
  })

  it('ผู้ใช้ที่ไม่มีสิทธิ์ manage_roles โดน 403 (UI ซ่อนปุ่มไม่ใช่ security — DEC-002)', async () => {
    requireSessionMock.mockResolvedValue(
      session({
        isSuperadmin: false,
        roleName: 'การเงิน',
        capabilities: { view_master_data: 'view' },
      }),
    )

    const response = await PATCH(
      patchRequest({
        entries: [{ capabilityCode: 'manage_billing', level: 'manage' }],
        reason: 'ลองแก้สิทธิ์เองโดยไม่มีสิทธิ์',
      }),
      context,
    )

    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('PERMISSION_DENIED')
    expect(queriesMock.applyRolePermissionChanges).not.toHaveBeenCalled()
  })
})

describe('GET /api/roles/:id/permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queriesMock.getRole.mockResolvedValue(customRole)
    queriesMock.listCapabilities.mockResolvedValue(CAPABILITIES)
    queriesMock.getRoleAssignments.mockResolvedValue({ manage_billing: 'view' })
  })

  it('คืน matrix จัดกลุ่มพร้อมธง locked/editable', async () => {
    requireSessionMock.mockResolvedValue(
      session({ isSuperadmin: false, roleName: 'บัญชี', capabilities: { view_master_data: 'view' } }),
    )

    const response = await GET({} as NextRequest, context)
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      data: { sections: Array<{ id: string; rows: Array<{ code: string; level: string; locked: boolean; editable: boolean }> }> }
    }
    const rows = body.data.sections.flatMap((section) => section.rows)

    expect(rows.find((row) => row.code === 'manage_billing')).toMatchObject({ level: 'view', editable: true })
    expect(rows.find((row) => row.code === 'unlock_period')).toMatchObject({ locked: true, editable: false })
  })

  it('ผู้ใช้ที่ไม่มีสิทธิ์ดู master data โดน 403', async () => {
    requireSessionMock.mockResolvedValue(
      session({ isSuperadmin: false, roleName: 'พนักงานติดตามทรัพย์', roleGroup: 'inhouse', capabilities: {} }),
    )

    const response = await GET({} as NextRequest, context)
    expect(response.status).toBe(403)
  })
})

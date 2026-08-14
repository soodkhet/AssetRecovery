import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import type { PermissionChange } from '@/lib/roles/guards'

/**
 * ยาม audit + session cache ของการแก้ Permission Matrix (`90` §13 · `05` §17)
 * Prisma ถูก mock ทั้งก้อน — เทสต์นี้ตรวจ "เขียนอะไรลงไปบ้าง" ไม่ได้แตะ DB จริง
 */
const prismaMock = vi.hoisted(() => {
  const client = {
    capability: { findUnique: vi.fn() },
    roleCapability: { upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  client.$transaction.mockImplementation((run: (tx: typeof client) => Promise<unknown>) => run(client))
  return client
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const clearSessionCacheMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session-cache', () => ({ clearSessionCache: clearSessionCacheMock }))

const { applyRolePermissionChanges } = await import('@/lib/roles/queries')

const actor: SessionUser = {
  id: 'actor-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'superadmin@example.com',
  fullName: 'ผู้ดูแลระบบ',
  status: 'active',
  roleId: 'role-superadmin',
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: resolveScope({
    userId: 'actor-1',
    roleGroup: 'system',
    roleName: 'Superadmin',
    teamId: null,
    companyId: null,
    managedTeamIds: [],
    supervisedTeamIds: [],
  }),
  loginAt: new Date().toISOString(),
}

const context = {
  actor,
  meta: { ipAddress: '10.0.0.1', userAgent: 'vitest' },
  reason: 'ปรับสิทธิ์ตามมติที่ประชุม 14/08/2569',
}
const role = { id: 'role-1', name: 'ผู้ตรวจสอบภายใน' }

describe('applyRolePermissionChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation((run: (tx: typeof prismaMock) => Promise<unknown>) =>
      run(prismaMock),
    )
    prismaMock.capability.findUnique.mockResolvedValue({ id: 'cap-1' })
  })

  it('upsert เมื่อได้รับสิทธิ์ · ลบ record เมื่อเป็น none (DEC-009) · เขียน audit ครบใน transaction เดียว', async () => {
    const changes: PermissionChange[] = [
      { code: 'manage_billing', from: 'none', to: 'manage' },
      { code: 'view_finance_dashboard', from: 'view', to: 'none' },
    ]

    await applyRolePermissionChanges(
      context,
      role,
      changes,
      { manage_billing: 'none', view_finance_dashboard: 'view' },
      { manage_billing: 'manage', view_finance_dashboard: 'none' },
    )

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.roleCapability.upsert).toHaveBeenCalledTimes(1)
    expect(prismaMock.roleCapability.deleteMany).toHaveBeenCalledTimes(1)

    const auditArgs = prismaMock.auditLog.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(auditArgs.data).toMatchObject({
      organizationId: 'org-1',
      actorId: 'actor-1',
      actorRole: 'Superadmin',
      action: 'update',
      targetType: 'role_capabilities',
      targetId: 'role-1',
      reason: 'ปรับสิทธิ์ตามมติที่ประชุม 14/08/2569',
      ipAddress: '10.0.0.1',
    })
    expect(auditArgs.data.beforeData).toEqual({ manage_billing: 'none', view_finance_dashboard: 'view' })
    expect(auditArgs.data.afterData).toEqual({ manage_billing: 'manage', view_finance_dashboard: 'none' })
  })

  it('ล้าง session cache หลังบันทึกสำเร็จ (สิทธิ์ระดับ role กระทบผู้ใช้ทุกคนในบทบาท)', async () => {
    await applyRolePermissionChanges(
      context,
      role,
      [{ code: 'manage_billing', from: 'none', to: 'view' }],
      { manage_billing: 'none' },
      { manage_billing: 'view' },
    )

    expect(clearSessionCacheMock).toHaveBeenCalledTimes(1)
  })

  it('ไม่มีรายการเปลี่ยน = ไม่แตะ DB และไม่ล้าง cache', async () => {
    await applyRolePermissionChanges(context, role, [], {}, {})

    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(clearSessionCacheMock).not.toHaveBeenCalled()
  })

  it('ไม่มี reason = โยน AUDIT_REASON_REQUIRED (ยามของ `lib/audit`)', async () => {
    await expect(
      applyRolePermissionChanges(
        { ...context, reason: '' },
        role,
        [{ code: 'manage_billing', from: 'none', to: 'view' }],
        { manage_billing: 'none' },
        { manage_billing: 'view' },
      ),
    ).rejects.toMatchObject({ code: 'AUDIT_REASON_REQUIRED' })
  })
})

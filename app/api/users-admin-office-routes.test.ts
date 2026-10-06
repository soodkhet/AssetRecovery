import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * UAT BUG-021 (มติ PO 03/10/2569 "เปิดหน้าผู้ใช้ให้ธุรการ") — ระดับ route ทั้งชั้นสิทธิ์ + ชั้นข้อมูล
 *
 *  · ธุรการ (`manage:manage_users` — `05` §12) สร้างผู้ใช้กลุ่ม inhouse ได้
 *  · บัญชีกลุ่ม system ยังเป็นของ Superadmin เท่านั้น (DEC-010): สร้าง/ย้ายเข้ากลุ่ม = 403
 *  · บัญชีกลุ่ม system ที่มองไม่เห็น (ดู/แก้/ตั้งรหัสรายคน) = 404 เหมือนไม่มีจริง (มติ PO U138 — ไม่ leak)
 *  · รายการผู้ใช้ของธุรการกรองกลุ่ม system ออก (ทั้งองค์กรเฉพาะกลุ่มที่ไม่ใช่ system)
 *
 * mock แค่ session + Prisma + Supabase Auth + audit — ใช้ `requirePermission()`/ยามของ service ตัวจริง
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const prismaMock = vi.hoisted(() => ({
  role: { findFirst: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  team: { findFirst: vi.fn() },
  financeCompany: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const provisioningMock = vi.hoisted(() => ({
  createAuthAccount: vi.fn(),
  deleteAuthAccount: vi.fn(),
  setAuthPassword: vi.fn(),
  syncAuthEmail: vi.fn(),
}))
vi.mock('@/lib/users/provisioning', () => provisioningMock)
vi.mock('@/lib/audit/audit', () => ({ emitAudit: vi.fn() }))

const usersRoute = await import('@/app/api/users/route')
const userRoute = await import('@/app/api/users/[id]/route')
const passwordRoute = await import('@/app/api/users/[id]/password/route')

const ADMIN_OFFICE: SessionUser = {
  id: '00000000-0000-4000-8000-0000000d0001',
  organizationId: 'org-1',
  supabaseUid: 'uid-admin-office',
  email: 'admin-office@example.com',
  fullName: 'ธุรการทดสอบ',
  status: 'active',
  roleId: 'role-admin-office',
  roleName: 'ธุรการ',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_users: 'manage', view_master_data: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: '00000000-0000-4000-8000-0000000d0001' },
  loginAt: new Date().toISOString(),
}

const INHOUSE_ROLE_ID = '00000000-0000-4000-8000-0000000d0010'
const SYSTEM_ROLE_ID = '00000000-0000-4000-8000-0000000d0011'
const TEAM_ID = '00000000-0000-4000-8000-0000000d0020'
const SYSTEM_USER_ID = '00000000-0000-4000-8000-0000000d0030'
const INHOUSE_USER_ID = '00000000-0000-4000-8000-0000000d0031'

function userRow(id: string, roleGroup: 'system' | 'inhouse') {
  return {
    id,
    username: roleGroup === 'system' ? 'finance01' : 'agent01',
    email: null,
    fullName: roleGroup === 'system' ? 'การเงินทดสอบ' : 'ภาคสนามทดสอบ',
    phone: null,
    employeeCode: null,
    roleId: roleGroup === 'system' ? SYSTEM_ROLE_ID : INHOUSE_ROLE_ID,
    teamId: roleGroup === 'system' ? null : TEAM_ID,
    companyId: null,
    status: 'active',
    supabaseUid: `uid-${id}`,
    mustChangePassword: false,
    lastLoginAt: null,
    updatedAt: new Date('2026-10-03T00:00:00Z'),
    role: { name: roleGroup === 'system' ? 'การเงิน' : 'พนักงานภาคสนาม', roleGroup },
    team: roleGroup === 'system' ? null : { name: 'ทีม A' },
    company: null,
    _count: { assignmentsAsAgent: 0 },
    payeeProfile: [],
  }
}

function request(method: string, url: string, payload?: unknown): NextRequest {
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

interface Envelope {
  error?: { code: string } | null
}

function createBody(roleId: string, teamId: string | null) {
  return {
    roleId,
    username: 'newuser01',
    email: null,
    fullName: 'ผู้ใช้ใหม่ ทดสอบ',
    phone: null,
    employeeCode: null,
    teamId,
    companyId: null,
    password: 'Passw0rd99',
    confirmPassword: 'Passw0rd99',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.team.findFirst.mockResolvedValue({ id: TEAM_ID })
  prismaMock.role.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === SYSTEM_ROLE_ID ? { name: 'การเงิน', roleGroup: 'system' } : { name: 'พนักงานภาคสนาม', roleGroup: 'inhouse' },
    ),
  )
  provisioningMock.createAuthAccount.mockResolvedValue('uid-new')
  prismaMock.$transaction.mockImplementation((run: (tx: unknown) => Promise<unknown>) =>
    run({ user: { create: vi.fn().mockResolvedValue(userRow(INHOUSE_USER_ID, 'inhouse')) } }),
  )
})

describe('ธุรการจัดการผู้ใช้ได้เฉพาะกลุ่มที่ไม่ใช่ system (UAT BUG-021)', () => {
  it('สร้างผู้ใช้กลุ่ม inhouse ได้ → 201', async () => {
    const response = await usersRoute.POST(
      request('POST', 'http://localhost/api/users', createBody(INHOUSE_ROLE_ID, TEAM_ID)),
      undefined,
    )
    expect(response.status).toBe(201)
    expect(provisioningMock.createAuthAccount).toHaveBeenCalledOnce()
  })

  it('สร้างผู้ใช้กลุ่ม system → 403 · ไม่สร้างบัญชี Auth', async () => {
    const response = await usersRoute.POST(
      request('POST', 'http://localhost/api/users', createBody(SYSTEM_ROLE_ID, null)),
      undefined,
    )
    expect(response.status).toBe(403)
    expect(((await response.json()) as Envelope).error?.code).toBe('PERMISSION_DENIED')
    expect(provisioningMock.createAuthAccount).not.toHaveBeenCalled()
  })

  it('แก้ผู้ใช้กลุ่ม system → 404 (มองไม่เห็น — U138)', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(userRow(SYSTEM_USER_ID, 'system'))
    const response = await userRoute.PATCH(
      request('PATCH', `http://localhost/api/users/${SYSTEM_USER_ID}`, {
        ...createBody(SYSTEM_ROLE_ID, null),
        username: 'finance01',
      }),
      params(SYSTEM_USER_ID),
    )
    expect(response.status).toBe(404)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('ย้ายผู้ใช้ inhouse เข้ากลุ่ม system → 403', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(userRow(INHOUSE_USER_ID, 'inhouse'))
    const response = await userRoute.PATCH(
      request('PATCH', `http://localhost/api/users/${INHOUSE_USER_ID}`, {
        ...createBody(SYSTEM_ROLE_ID, null),
        username: 'agent01',
      }),
      params(INHOUSE_USER_ID),
    )
    expect(response.status).toBe(403)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('ตั้งรหัสผ่านให้ผู้ใช้กลุ่ม system → 404 (มองไม่เห็น — U138) · ไม่แตะ Supabase Auth', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(userRow(SYSTEM_USER_ID, 'system'))
    const response = await passwordRoute.POST(
      request('POST', `http://localhost/api/users/${SYSTEM_USER_ID}/password`, {
        password: 'Passw0rd99',
        confirmPassword: 'Passw0rd99',
      }),
      params(SYSTEM_USER_ID),
    )
    expect(response.status).toBe(404)
    expect(provisioningMock.setAuthPassword).not.toHaveBeenCalled()
  })

  it('ดูผู้ใช้กลุ่ม system รายคน → 404 (มองไม่เห็น — U138)', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(userRow(SYSTEM_USER_ID, 'system'))
    const response = await userRoute.GET(request('GET', `http://localhost/api/users/${SYSTEM_USER_ID}`), params(SYSTEM_USER_ID))
    expect(response.status).toBe(404)
  })

  it('รายการผู้ใช้กรองกลุ่ม system ออก (ยกเว้นตัวเอง)', async () => {
    const response = await usersRoute.GET(request('GET', 'http://localhost/api/users?status=all'), undefined)
    expect(response.status).toBe(200)
    const where = (prismaMock.user.findMany.mock.calls[0]?.[0] as { where: { AND: unknown[] } }).where
    expect(where.AND).toContainEqual({
      AND: [{}, { OR: [{ role: { roleGroup: { notIn: ['system'] } } }, { id: ADMIN_OFFICE.id }] }],
    })
  })
})

describe('รายการผู้ใช้ — คำค้นต้องไม่ทับ scope ทีม', () => {
  /** เดิม spread `OR` ของคำค้นทับ `OR` ของ scope ทีม ⇒ ผู้จัดการทีมค้นชื่อแล้วเห็นผู้ใช้ทั้งองค์กร */
  it('ผู้จัดการทีม (view + scope ทีม) ค้นชื่อ → where มีทั้ง scope ทีมและคำค้นแยกก้อน', async () => {
    requireSessionMock.mockResolvedValue({
      ...ADMIN_OFFICE,
      id: 'mgr-1',
      roleName: 'ผู้จัดการทีมติดตามทรัพย์',
      roleGroup: 'inhouse',
      capabilities: { manage_users: 'view' },
      scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: 'mgr-1' },
    })
    const url = `http://localhost/api/users?status=all&search=${encodeURIComponent('สม')}`
    const response = await usersRoute.GET(request('GET', url), undefined)
    expect(response.status).toBe(200)
    const where = (prismaMock.user.findMany.mock.calls[0]?.[0] as { where: { AND: unknown[]; OR?: unknown } }).where
    expect(where.OR).toBeUndefined()
    expect(where.AND).toContainEqual({ OR: [{ teamId: { in: [TEAM_ID] } }, { id: 'mgr-1' }] })
    expect(where.AND).toContainEqual(
      expect.objectContaining({ OR: expect.arrayContaining([{ fullName: { contains: 'สม', mode: 'insensitive' } }]) }),
    )
  })
})

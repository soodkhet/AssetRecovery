import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * มติ D7-02 (mytester7 S7-AG7-05) — สิทธิ์/สถานะที่เปลี่ยนที่ instance อื่นต้องมีผลกับคำขอถัดไปทันที
 * จำลอง "instance นี้" ถือ cache ไว้ แล้วฐานขยับเวอร์ชัน (ไม่มีใครเรียก invalidate ที่ instance นี้)
 */
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
  }),
}))

import { clearSessionCache, getCachedSession } from '@/lib/auth/session-cache'
import { getSessionUser } from '@/lib/auth/session'
import { AuthError } from '@/lib/auth/errors'

const UID = '00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-18T12:00:00Z')

function dbUser(overrides: {
  status?: 'active' | 'suspended'
  userVersion?: number
  roleVersion?: number
  capabilities?: { accessLevel: 'view' | 'manage'; capability: { code: string } }[]
}) {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: UID,
    username: 'uat.admin',
    email: null,
    fullName: 'ธุรการ',
    status: overrides.status ?? 'active',
    teamId: null,
    companyId: null,
    lastLoginAt: new Date('2026-10-18T11:00:00Z'),
    mustChangePassword: false,
    deletedAt: null,
    authzVersion: overrides.userVersion ?? 1,
    role: {
      id: 'role-1',
      authzVersion: overrides.roleVersion ?? 1,
      name: 'ธุรการ',
      roleGroup: 'system',
      capabilities: overrides.capabilities ?? [{ accessLevel: 'manage', capability: { code: 'manage_device_catalog' } }],
    },
    managedTeams: [],
    supervisedTeams: [],
  }
}

function dbVersion(user: number, role: number) {
  return [{ user_version: user, role_version: role }]
}

beforeEach(() => {
  clearSessionCache()
  prismaMock.user.findUnique.mockReset()
  prismaMock.$queryRaw.mockReset()
})

describe('session cache ตรวจเวอร์ชันสิทธิ์กับฐานทุกคำขอ (มติ D7-02)', () => {
  it('เวอร์ชันตรง → ใช้ cache (query เบา 1 ครั้ง ไม่โหลด session เต็ม)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbUser({}))
    await getSessionUser(NOW)
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1)

    prismaMock.$queryRaw.mockResolvedValue(dbVersion(1, 1))
    const user = await getSessionUser(NOW)
    expect(user?.capabilities['manage_device_catalog']).toBe('manage')
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('ถอดสิทธิ์ของ role ที่ instance อื่น (roles.authz_version ขยับ) → คำขอถัดไปไม่มีสิทธิ์ทันที', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({}))
    await getSessionUser(NOW)

    prismaMock.$queryRaw.mockResolvedValue(dbVersion(1, 2))
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({ roleVersion: 2, capabilities: [] }))
    const user = await getSessionUser(NOW)
    expect(user?.capabilities['manage_device_catalog']).toBeUndefined()
    expect(getCachedSession(UID, NOW.getTime())?.authzVersion).toEqual({ user: 1, role: 2 })
  })

  it('คืนสิทธิ์ (ทิศกลับ) ก็มีผลทันที — ไม่ค้างผล "ไม่มีสิทธิ์" ใน cache', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({ capabilities: [] }))
    await getSessionUser(NOW)

    prismaMock.$queryRaw.mockResolvedValue(dbVersion(1, 2))
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({ roleVersion: 2 }))
    const user = await getSessionUser(NOW)
    expect(user?.capabilities['manage_device_catalog']).toBe('manage')
  })

  it('ระงับผู้ใช้ที่ instance อื่น (users.authz_version ขยับ) → คำขอถัดไปโดน ACCOUNT_INACTIVE ทันที', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({}))
    await getSessionUser(NOW)

    prismaMock.$queryRaw.mockResolvedValue(dbVersion(2, 1))
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({ status: 'suspended', userVersion: 2 }))
    await expect(getSessionUser(NOW)).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' })
  })

  it('ไม่พบผู้ใช้ในฐานแล้ว (ตรวจเวอร์ชันได้ null) → ทิ้ง cache แล้วโหลดใหม่ ได้ USER_NOT_PROVISIONED', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({}))
    await getSessionUser(NOW)

    prismaMock.$queryRaw.mockResolvedValue([])
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const err = await getSessionUser(NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AuthError)
    expect((err as AuthError).code).toBe('USER_NOT_PROVISIONED')
    expect(getCachedSession(UID, NOW.getTime())).toBeNull()
  })

  it('ตรวจเวอร์ชันไม่สำเร็จ (ฐานล่ม) → โยน error ไม่เสิร์ฟ cache เก่า', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dbUser({}))
    await getSessionUser(NOW)

    prismaMock.$queryRaw.mockRejectedValue(new Error('db down'))
    await expect(getSessionUser(NOW)).rejects.toThrow('db down')
  })
})

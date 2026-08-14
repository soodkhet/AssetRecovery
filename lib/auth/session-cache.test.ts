import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSessionCache,
  getCachedSession,
  invalidateSessionCache,
  sessionCacheSize,
  setCachedSession,
} from '@/lib/auth/session-cache'
import { SESSION_CACHE_TTL_MS } from '@/lib/auth/constants'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'

const UID = 'uid-1'
const T0 = 1_760_000_000_000

const user: SessionUser = {
  id: 'user-1',
  organizationId: 'org-1',
  supabaseUid: UID,
  email: 'user@example.com',
  fullName: 'ผู้ใช้ทดสอบ',
  status: 'active',
  roleId: 'role-1',
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: resolveScope({
    userId: 'user-1',
    roleGroup: 'system',
    roleName: 'บัญชี',
    teamId: null,
    companyId: null,
    managedTeamIds: [],
    supervisedTeamIds: [],
  }),
  loginAt: new Date(T0).toISOString(),
}

describe('session cache (role+scope — ห้าม query DB ทุก request, `01` §6.1)', () => {
  beforeEach(() => {
    clearSessionCache()
  })

  it('อ่านค่าที่ cache ไว้ได้ก่อนหมด TTL', () => {
    setCachedSession(UID, user, T0)
    expect(getCachedSession(UID, T0 + SESSION_CACHE_TTL_MS - 1)?.id).toBe('user-1')
  })

  it('หมด TTL แล้วต้องไปโหลดใหม่ (คืน null + เคลียร์ทิ้ง)', () => {
    setCachedSession(UID, user, T0)
    expect(getCachedSession(UID, T0 + SESSION_CACHE_TTL_MS)).toBeNull()
    expect(sessionCacheSize()).toBe(0)
  })

  it('invalidate ทำให้ role/สถานะที่เปลี่ยนมีผลทันที', () => {
    setCachedSession(UID, user, T0)
    invalidateSessionCache(UID)
    expect(getCachedSession(UID, T0)).toBeNull()
  })

  it('uid ที่ไม่เคย cache = null', () => {
    expect(getCachedSession('uid-ไม่มี', T0)).toBeNull()
  })
})

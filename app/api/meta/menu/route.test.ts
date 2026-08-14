import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/errors'
import { resolveScope } from '@/lib/auth/scope'
import {
  ACCOUNTING_ROLE_NAME,
  CASE_APPROVER_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
} from '@/lib/auth/constants'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import type { SessionUser } from '@/lib/auth/types'

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const { GET } = await import('@/app/api/meta/menu/route')

function sessionUser(roleName: string, roleGroup: RoleGroup, isSuperadmin = false): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ใช้ ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName,
    roleGroup,
    isSuperadmin,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: resolveScope({
      userId: 'user-1',
      roleGroup,
      roleName,
      teamId: null,
      companyId: null,
      managedTeamIds: [],
      supervisedTeamIds: [],
    }),
    loginAt: new Date().toISOString(),
  }
}

const request = {} as NextRequest

interface MenuResponseBody {
  data: { audience: string | null; menus: Array<{ id: string; children?: Array<{ id: string }> }> }
}

describe('GET /api/meta/menu (`06` §14)', () => {
  beforeEach(() => {
    requireSessionMock.mockReset()
  })

  it('คืนเมนูของผู้เรียกเองตาม matrix `06` §7.2', async () => {
    requireSessionMock.mockResolvedValue(sessionUser(ACCOUNTING_ROLE_NAME, 'system'))

    const response = await GET(request, undefined)
    expect(response.status).toBe(200)

    const body = (await response.json()) as MenuResponseBody
    expect(body.data.audience).toBe('accounting')
    expect(body.data.menus.map((menu) => menu.id)).toEqual(['dashboard', 'accounting', 'warehouse', 'reports'])
  })

  it('กรองแท็บย่อยของ "จัดการเคส" ตาม `06` §7.1.1 ด้วย', async () => {
    requireSessionMock.mockResolvedValue(sessionUser(CASE_APPROVER_ROLE_NAME, 'system'))

    const body = (await (await GET(request, undefined)).json()) as MenuResponseBody
    const cases = body.data.menus.find((menu) => menu.id === 'cases')
    expect(cases?.children?.map((child) => child.id)).toEqual(['cases.submit'])
  })

  it('พนักงานติดตามทรัพย์เห็นเฉพาะแดชบอร์ด + จัดการเคส (แท็บติดตามภาคสนาม)', async () => {
    requireSessionMock.mockResolvedValue(sessionUser(FIELD_AGENT_ROLE_NAME, 'outsource'))

    const body = (await (await GET(request, undefined)).json()) as MenuResponseBody
    expect(body.data.menus.map((menu) => menu.id)).toEqual(['dashboard', 'cases'])
    expect(body.data.menus[1]?.children?.map((child) => child.id)).toEqual(['cases.field'])
  })

  it('ยังไม่ได้ login → 401 ไม่ใช่ 500 (แปลง AuthError เป็น response มาตรฐาน)', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))

    const response = await GET(request, undefined)
    expect(response.status).toBe(401)
  })

  it('session หมดอายุ / บัญชีถูกระงับ → 401 พร้อม error code จาก `24` §6.9', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('SESSION_EXPIRED'))

    const response = await GET(request, undefined)
    const body = (await response.json()) as { error: { code: string } }
    expect(response.status).toBe(401)
    expect(body.error.code).toBe('SESSION_EXPIRED')
  })
})

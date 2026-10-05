import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'
import {
  ACCOUNTING_ROLE_NAME,
  EXECUTIVE_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
  FINANCE_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
} from '@/lib/auth/constants'
import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'

/**
 * มติ PO 05/10/2569 (UAT U30) — สิทธิ์ของ endpoint ปิดยอดคืนเงินทดรอง (`25` §7.2: การเงินเท่านั้น)
 * `PATCH /api/advances/:id/return-method` · `POST /api/advances/:id/returns` ผูก `manage:approve_advance`
 * capability ของแต่ละ role มาจาก default matrix จริง — role อื่น (รวมเจ้าของเงินทดรอง) ต้องได้ 403
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  changeAdvanceReturnMethod: vi.fn(),
  recordAdvanceSeparateReturn: vi.fn(),
  APPROVE_ADVANCE: 'approve_advance',
}))
vi.mock('@/lib/advances/queries', () => queriesMock)

const { PATCH: patchMethod } = await import('@/app/api/advances/[id]/return-method/route')
const { POST: postReturn } = await import('@/app/api/advances/[id]/returns/route')

const ADVANCE_ID = '00000000-0000-4000-8000-000000000a01'

function userOf(roleName: string, roleGroup: RoleGroup): SessionUser {
  const capabilities: Record<string, CapabilityAccessLevel> = Object.fromEntries(
    DEFAULT_ROLE_CAPABILITIES.filter(
      (assignment) => assignment.role.name === roleName && assignment.role.roleGroup === roleGroup,
    ).map((assignment) => [assignment.capabilityCode, assignment.level] as const),
  )
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'u@example.com',
    fullName: roleName,
    status: 'active',
    roleId: 'role-1',
    roleName,
    roleGroup,
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

function jsonRequest(method: string, body: unknown): NextRequest {
  const base = new Request(`http://localhost/api/advances/${ADVANCE_ID}/x`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(base.url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: ADVANCE_ID }) }
const methodBody = { returnMethod: 'separate', reason: 'ผู้รับขอคืนเป็นเงินสด' }
const returnBody = {
  channel: 'cash',
  amountSatang: 55_000,
  receivedDate: '2026-10-05',
  evidenceFilePath: `advances/${ADVANCE_ID}/returns/11111111-1111-4111-8111-111111111111.pdf`,
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.changeAdvanceReturnMethod.mockReset().mockResolvedValue({ id: ADVANCE_ID })
  queriesMock.recordAdvanceSeparateReturn.mockReset().mockResolvedValue({ id: ADVANCE_ID })
})

describe('การเงินเรียกได้', () => {
  it('เปลี่ยนวิธีคืน → 200 · รับคืนแยก → 201', async () => {
    requireSessionMock.mockResolvedValue(userOf(FINANCE_ROLE_NAME, 'system'))
    expect((await patchMethod(jsonRequest('PATCH', methodBody), params)).status).toBe(200)
    expect((await postReturn(jsonRequest('POST', returnBody), params)).status).toBe(201)
    expect(queriesMock.changeAdvanceReturnMethod).toHaveBeenCalledOnce()
    expect(queriesMock.recordAdvanceSeparateReturn).toHaveBeenCalledOnce()
  })

  it('ไม่มีเหตุผล/ไม่มีหลักฐาน → 400 ไม่ถึงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(userOf(FINANCE_ROLE_NAME, 'system'))
    expect((await patchMethod(jsonRequest('PATCH', { returnMethod: 'separate', reason: '' }), params)).status).toBe(400)
    expect((await postReturn(jsonRequest('POST', { ...returnBody, evidenceFilePath: '' }), params)).status).toBe(400)
    expect(queriesMock.changeAdvanceReturnMethod).not.toHaveBeenCalled()
    expect(queriesMock.recordAdvanceSeparateReturn).not.toHaveBeenCalled()
  })
})

describe.each([
  [FIELD_AGENT_ROLE_NAME, 'outsource' as RoleGroup],
  [FIELD_AGENT_ROLE_NAME, 'inhouse' as RoleGroup],
  [TEAM_MANAGER_ROLE_NAME, 'inhouse' as RoleGroup],
  [ACCOUNTING_ROLE_NAME, 'system' as RoleGroup],
  [EXECUTIVE_ROLE_NAME, 'system' as RoleGroup],
])('%s (%s) → 403', (roleName, roleGroup) => {
  it('ทั้งสอง endpoint', async () => {
    requireSessionMock.mockResolvedValue(userOf(roleName, roleGroup))
    expect((await patchMethod(jsonRequest('PATCH', methodBody), params)).status).toBe(403)
    expect((await postReturn(jsonRequest('POST', returnBody), params)).status).toBe(403)
    expect(queriesMock.changeAdvanceReturnMethod).not.toHaveBeenCalled()
    expect(queriesMock.recordAdvanceSeparateReturn).not.toHaveBeenCalled()
  })
})

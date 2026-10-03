import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import type { AssignmentPolicyDto } from '@/lib/settings/types'

/**
 * เทสต์ระดับ route ของนโยบายการมอบหมายงาน (`40` §6.4/§13 — UAT BUG-002 · มติ PO 03/10/2569)
 *
 * ใช้ `requirePermission()` ตัวจริง (mock แค่ session) เพื่อยืนยัน capability ที่ผูกกับ endpoint:
 *  · แก้ได้เฉพาะ `manage_settings` (Superadmin — `40` §13) · role อื่นแม้ดูได้ก็ PATCH ไม่ได้ (403)
 *  · `reason` บังคับ (กระทบสิทธิ์ของหัวหน้าทีม — `90` §13) ไม่มี = 400 และไม่แตะชั้นข้อมูล
 *  · ไม่มี POST/DELETE (1 record ต่อองค์กร)
 * การเขียน DB + audit before/after + ผลต่อ `expires_at` ของคำขอใหม่ อยู่ใน `assignment-workflow.db.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getAssignmentPolicySettings: vi.fn(),
  updateAssignmentPolicySettings: vi.fn(),
}))
vi.mock('@/lib/settings/queries/assignment-policy', () => queriesMock)

const route = await import('@/app/api/settings/assignment-policy/route')

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ผู้บริหาร',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const SUPERADMIN = sessionUser({ id: 'sa-1', roleName: 'Superadmin', isSuperadmin: true })
/** ดูข้อมูลหลักได้ แต่ไม่มี `manage_settings` */
const EXECUTIVE = sessionUser({ id: 'exec-1', capabilities: { view_master_data: 'view' } })
const SUPERVISOR = sessionUser({
  id: 'sup-1',
  roleName: 'หัวหน้าทีมติดตามทรัพย์',
  roleGroup: 'inhouse',
  capabilities: { assign_case: 'manage' },
  scope: { kind: 'team', teamIds: ['team-1'], companyId: null, userId: 'sup-1' },
})

const POLICY: AssignmentPolicyDto = {
  reassignTimeoutHours: 5,
  supervisorCanAssignSystem: true,
  supervisorCanAssignInhouse: false,
  supervisorCanAssignOutsource: true,
  acceptDeadlineHours: null,
  updatedAt: '2026-10-03T03:00:00.000Z',
}

const VALID_BODY = {
  reassignTimeoutHours: 5,
  supervisorCanAssignSystem: true,
  supervisorCanAssignInhouse: false,
  supervisorCanAssignOutsource: true,
  acceptDeadlineHours: null,
  reason: 'ปิดสิทธิ์หัวหน้าทีม Inhouse ตามมติที่ประชุม',
}

function request(method: string, body?: unknown): NextRequest {
  const url = 'http://localhost/api/settings/assignment-policy'
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

interface Envelope {
  data?: unknown
  error?: { code: string; fields?: Record<string, string> } | null
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.getAssignmentPolicySettings.mockReset()
  queriesMock.updateAssignmentPolicySettings.mockReset()
})

describe('สิทธิ์ของนโยบายการมอบหมายงาน (`40` §13 — Superadmin เท่านั้นที่แก้ได้)', () => {
  it('Superadmin แก้ได้ — ส่งค่าที่ผ่าน schema + เหตุผล + ผู้กระทำ ลงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.updateAssignmentPolicySettings.mockResolvedValue(POLICY)

    const response = await route.PATCH(request('PATCH', VALID_BODY), undefined)

    expect(response.status).toBe(200)
    expect(((await response.json()) as Envelope).data).toEqual(POLICY)
    expect(queriesMock.updateAssignmentPolicySettings).toHaveBeenCalledTimes(1)
    const [context, values] = queriesMock.updateAssignmentPolicySettings.mock.calls[0] as [
      { actor: SessionUser; reason: string },
      Record<string, unknown>,
    ]
    expect(context.actor.id).toBe(SUPERADMIN.id)
    expect(context.reason).toBe(VALID_BODY.reason)
    expect(values).toEqual({
      reassignTimeoutHours: 5,
      supervisorCanAssignSystem: true,
      supervisorCanAssignInhouse: false,
      supervisorCanAssignOutsource: true,
      acceptDeadlineHours: null,
    })
    // reason ไม่หลุดเข้าไปเป็นค่าตั้ง
    expect(values).not.toHaveProperty('reason')
  })

  it('ผู้บริหาร (ดูข้อมูลหลักได้ แต่ไม่มี manage_settings) อ่านได้ แต่แก้ไม่ได้ = 403', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    queriesMock.getAssignmentPolicySettings.mockResolvedValue(POLICY)

    const read = await route.GET(request('GET'), undefined)
    expect(read.status).toBe(200)

    const write = await route.PATCH(request('PATCH', VALID_BODY), undefined)
    expect(write.status).toBe(403)
    expect(((await write.json()) as Envelope).error?.code).toBe('PERMISSION_DENIED')
    expect(queriesMock.updateAssignmentPolicySettings).not.toHaveBeenCalled()
  })

  it('หัวหน้าทีม (ผู้ถูกคุมด้วยค่านี้) แก้ค่าเองไม่ได้ = 403 และไม่แตะชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(SUPERVISOR)

    const responses = await Promise.all([
      route.GET(request('GET'), undefined),
      route.PATCH(request('PATCH', { ...VALID_BODY, supervisorCanAssignInhouse: true }), undefined),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(queriesMock.getAssignmentPolicySettings).not.toHaveBeenCalled()
    expect(queriesMock.updateAssignmentPolicySettings).not.toHaveBeenCalled()
  })

  it('1 record ต่อองค์กร — route มีแค่ GET/PATCH', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'PATCH'])
  })
})

describe('validation + เหตุผล (`90` §13 — กระทบสิทธิ์ต้องมี reason)', () => {
  beforeEach(() => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
  })

  it('ไม่มีเหตุผล = 400 REQUIRED_MISSING พร้อม field error และไม่เขียนอะไรเลย', async () => {
    const { reason: _omit, ...withoutReason } = VALID_BODY
    const response = await route.PATCH(request('PATCH', withoutReason), undefined)

    expect(response.status).toBe(400)
    const envelope = (await response.json()) as Envelope
    expect(envelope.error?.code).toBe('REQUIRED_MISSING')
    expect(envelope.error?.fields).toHaveProperty('reason')
    expect(queriesMock.updateAssignmentPolicySettings).not.toHaveBeenCalled()
  })

  it('เวลารอความยินยอม 0 ชั่วโมง = 400 (คำขอจะหมดเวลาทันทีที่ส่ง)', async () => {
    const response = await route.PATCH(request('PATCH', { ...VALID_BODY, reassignTimeoutHours: 0 }), undefined)

    expect(response.status).toBe(400)
    expect(((await response.json()) as Envelope).error?.fields).toHaveProperty('reassignTimeoutHours')
    expect(queriesMock.updateAssignmentPolicySettings).not.toHaveBeenCalled()
  })
})

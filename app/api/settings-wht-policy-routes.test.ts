import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของค่าตั้งภาษีหัก ณ ที่จ่าย (มติ PO 05/10/2569 UAT U8)
 *
 * ใช้ `requirePermission()` ตัวจริง (mock แค่ session):
 *  · เพิ่มค่าตั้งได้เฉพาะ `manage_wht_policy` (Superadmin/บริหาร) · การเงิน/บัญชีที่อ่านได้ก็ POST ไม่ได้ (403)
 *  · `reason` บังคับ (กระทบภาษี) ไม่มี = 400 และไม่แตะชั้นข้อมูล
 * การเขียน DB + audit before/after + snapshot ลงรอบจ่าย อยู่ใน `lib/payout/wht-policy.db.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getWhtPolicyOverview: vi.fn(),
  createWhtPolicy: vi.fn(),
}))
vi.mock('@/lib/settings/queries/wht-policy', () => queriesMock)

const route = await import('@/app/api/settings/wht-policy/route')

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

const EXECUTIVE = sessionUser({
  id: 'exec-1',
  capabilities: { view_master_data: 'view', manage_wht_policy: 'manage' },
})
const FINANCE = sessionUser({ id: 'fin-1', roleName: 'การเงิน', capabilities: { view_master_data: 'view' } })

const VALID_BODY = {
  effectiveFrom: '2026-11-01',
  baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
  certificateMode: 'per_payee_batch',
  incomeTypeMode: 'by_team_side',
  reason: 'สำนักงานบัญชียืนยันว่าทีม Inhouse เป็นเงินได้ 40(2)',
}

function request(method: string, body?: unknown): NextRequest {
  const url = 'http://localhost/api/settings/wht-policy'
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

interface Envelope {
  data?: unknown
  error?: { code: string } | null
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.getWhtPolicyOverview.mockReset()
  queriesMock.createWhtPolicy.mockReset()
})

describe('สิทธิ์ค่าตั้งภาษีหัก ณ ที่จ่าย (Superadmin/บริหาร)', () => {
  it('บริหาร (manage_wht_policy) เพิ่มค่าตั้งได้ — ส่งค่า + เหตุผลลงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    queriesMock.createWhtPolicy.mockResolvedValue({ id: 'policy-1' })

    const response = await route.POST(request('POST', VALID_BODY), undefined)
    expect(response.status).toBe(201)
    const [context, values] = queriesMock.createWhtPolicy.mock.calls[0] as [
      { actor: SessionUser; reason: string },
      Record<string, unknown>,
    ]
    expect(context.actor.id).toBe(EXECUTIVE.id)
    expect(context.reason).toBe(VALID_BODY.reason)
    expect(values).toMatchObject({ certificateMode: 'per_payee_batch', incomeTypeMode: 'by_team_side' })
    expect(values).not.toHaveProperty('reason')
  })

  it('การเงิน (ดูข้อมูลหลักได้) อ่านได้ แต่เพิ่มค่าตั้งไม่ได้ = 403', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    queriesMock.getWhtPolicyOverview.mockResolvedValue({ history: [] })

    expect((await route.GET(request('GET'), undefined)).status).toBe(200)
    const write = await route.POST(request('POST', VALID_BODY), undefined)
    expect(write.status).toBe(403)
    expect(((await write.json()) as Envelope).error?.code).toBe('PERMISSION_DENIED')
    expect(queriesMock.createWhtPolicy).not.toHaveBeenCalled()
  })

  it('ไม่มีเหตุผล = 400 และไม่แตะชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    const response = await route.POST(request('POST', { ...VALID_BODY, reason: '' }), undefined)
    expect(response.status).toBe(400)
    expect(queriesMock.createWhtPolicy).not.toHaveBeenCalled()
  })
})

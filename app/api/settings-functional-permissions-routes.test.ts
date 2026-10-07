import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import { AuditError } from '@/lib/audit/errors'
import { RoleError } from '@/lib/roles/errors'

/**
 * UAT BUG-139 — มอบรายการ "✅ only" ผ่าน PATCH functional-permissions เคยตอบ 500 เพราะตัวแปลงกลาง
 * `toModuleErrorResponse()` ไม่รู้จัก `RoleError` ⇒ ต้องตอบตาม code เดิม (400 `CAPABILITY_LOCKED` ฯลฯ)
 * · `AuditError` (ลืมเหตุผล) ก็ต้องไม่ตก 500 เช่นกัน · ชั้นเขียนถูก mock
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const writeMock = vi.hoisted(() => ({
  applyFunctionalMatrixChanges: vi.fn(),
  getFunctionalMatrix: vi.fn(),
}))
vi.mock('@/lib/settings/queries/functional-permissions', () => writeMock)

const route = await import('@/app/api/settings/functional-permissions/route')

const SUPERADMIN: SessionUser = {
  id: 'sa-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'sa@example.com',
  fullName: 'ผู้ดูแลระบบ',
  status: 'active',
  roleId: 'role-sa',
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'sa-1' },
  loginAt: new Date().toISOString(),
}

const ROUTE_URL = 'http://localhost/api/settings/functional-permissions'

function patch(payload: unknown): NextRequest {
  const base = new Request(ROUTE_URL, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(ROUTE_URL) }) as NextRequest
}

const BODY = {
  entries: [{ roleId: '11111111-1111-4111-8111-111111111111', capabilityCode: 'manage_roles', level: 'manage' }],
  reason: 'มอบสิทธิ์ทดสอบ',
}

interface Envelope {
  error?: { code: string; message?: string } | null
}

beforeEach(() => {
  vi.clearAllMocks()
  requireSessionMock.mockResolvedValue(SUPERADMIN)
})

describe('PATCH /api/settings/functional-permissions — error ของโมดูลไม่ตก 500 (BUG-139)', () => {
  it.each([
    ['CAPABILITY_LOCKED', 400],
    ['ROLE_NOT_EDITABLE', 400],
    ['CAPABILITY_NOT_FOUND', 400],
    ['ROLE_NOT_FOUND', 404],
  ] as const)('RoleError %s → %i พร้อม code เดิม', async (code, status) => {
    writeMock.applyFunctionalMatrixChanges.mockRejectedValue(new RoleError(code, 'detail ฝั่ง server'))
    const res = await route.PATCH(patch(BODY), undefined)
    expect(res.status).toBe(status)
    const json = (await res.json()) as Envelope
    expect(json.error?.code).toBe(code)
    expect(json.error?.message).not.toContain('detail ฝั่ง server')
  })

  it('AuditError AUDIT_REASON_REQUIRED → 400', async () => {
    writeMock.applyFunctionalMatrixChanges.mockRejectedValue(new AuditError('AUDIT_REASON_REQUIRED'))
    const res = await route.PATCH(patch(BODY), undefined)
    expect(res.status).toBe(400)
    expect(((await res.json()) as Envelope).error?.code).toBe('AUDIT_REASON_REQUIRED')
  })

  it('error ชนิดอื่นได้ 500 INTERNAL_ERROR (ไม่กลืนเป็น 4xx ปลอม · preship PS-006)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    writeMock.applyFunctionalMatrixChanges.mockRejectedValue(new Error('db down'))
    const res = await route.PATCH(patch(BODY), undefined)
    expect(res.status).toBe(500)
    expect(((await res.json()) as Envelope).error?.code).toBe('INTERNAL_ERROR')
  })
})

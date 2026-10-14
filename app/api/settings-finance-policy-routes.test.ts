import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของนโยบายการเงินระดับองค์กร — ตรวจซ้ำ staging SV5-A11Y-A3-02
 *
 * ช่องเงินบังคับที่ส่งมาว่าง (null/ไม่ส่ง) และช่วงอายุหนี้ที่ว่าง ⇒ 400 `REQUIRED_MISSING` และไม่แตะชั้นข้อมูล
 * (ห้ามกลายเป็น 0 / ห้ามตัดช่วงทิ้งเงียบ) · เพดานตัดส่วนต่าง 0 = ไม่ตัด เป็นค่าที่ตั้งได้
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getFinancePolicy: vi.fn(),
  updateFinancePolicy: vi.fn(),
}))
vi.mock('@/lib/settings/queries/finance-policy', () => queriesMock)

const route = await import('@/app/api/settings/finance-policy/route')

const SUPERADMIN: SessionUser = {
  id: 'admin-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'admin@example.com',
  fullName: 'ผู้ดูแลระบบ',
  status: 'active',
  roleId: 'role-1',
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'admin-1' },
  loginAt: new Date().toISOString(),
}

const VALID_BODY = {
  advanceMaxAmountPerRequestSatang: null,
  requirePayeeIdDocument: false,
  arAgingBuckets: [30, 60, 90],
  writeOffToleranceSatang: 5_000,
  substituteReceiptMaxPerDocSatang: 50_000,
  substituteReceiptMaxPerMonthSatang: 300_000,
  reason: 'ปรับตามมติที่ประชุมการเงิน',
}

function request(body: unknown): NextRequest {
  const url = 'http://localhost/api/settings/finance-policy'
  const base = new Request(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

interface Envelope {
  error?: { code: string; fields?: Record<string, string> } | null
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.getFinancePolicy.mockReset()
  queriesMock.updateFinancePolicy.mockReset()
  requireSessionMock.mockResolvedValue(SUPERADMIN)
  queriesMock.getFinancePolicy.mockResolvedValue({ writeOffToleranceSatang: 5_000 })
  queriesMock.updateFinancePolicy.mockResolvedValue({ writeOffToleranceSatang: 0 })
})

describe('PATCH /api/settings/finance-policy — ค่าว่างไม่กลายเป็น 0', () => {
  it.each([
    ['เพดานตัดส่วนต่างเป็น null', { ...VALID_BODY, writeOffToleranceSatang: null }],
    ['ไม่ส่งเพดานตัดส่วนต่าง', (({ writeOffToleranceSatang: _omit, ...rest }) => rest)(VALID_BODY)],
    ['เพดานใบรับรองต่อใบเป็น null', { ...VALID_BODY, substituteReceiptMaxPerDocSatang: null }],
    ['เพดานใบรับรองต่อเดือนเป็น null', { ...VALID_BODY, substituteReceiptMaxPerMonthSatang: null }],
    ['ช่วงอายุหนี้มีช่องว่าง', { ...VALID_BODY, arAgingBuckets: [30, null, 90] }],
  ])('%s ⇒ 400 REQUIRED_MISSING ไม่บันทึก', async (_label, body) => {
    const response = await route.PATCH(request(body), undefined)
    expect(response.status).toBe(400)
    expect(((await response.json()) as Envelope).error?.code).toBe('REQUIRED_MISSING')
    expect(queriesMock.updateFinancePolicy).not.toHaveBeenCalled()
  })

  it('เพดานตัดส่วนต่าง 0 (ไม่ตัด) ที่ผู้ใช้ตั้งเอง ⇒ บันทึกค่า 0', async () => {
    const response = await route.PATCH(request({ ...VALID_BODY, writeOffToleranceSatang: 0 }), undefined)
    expect(response.status).toBe(200)
    const [, , values] = queriesMock.updateFinancePolicy.mock.calls[0] as [unknown, unknown, Record<string, unknown>]
    expect(values.writeOffToleranceSatang).toBe(0)
    expect(values.arAgingBuckets).toEqual([30, 60, 90])
  })
})

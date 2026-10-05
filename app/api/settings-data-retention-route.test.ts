import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของระยะเก็บเอกสารลูกหนี้ (PDPA — มติ PO 06/10/2569 U97)
 *
 * ใช้ `requirePermission()` ตัวจริง (mock แค่ session + ชั้นข้อมูล):
 *  · อ่าน/แก้ = `manage_data_retention` (บริหาร manage · Superadmin โดยนิยาม)
 *  · ไม่มีสิทธิ์ (เช่น การเงิน) = 403 ทั้งอ่านและเขียน · ไม่แตะชั้นข้อมูลเมื่อถูกปฏิเสธ
 *  · `reason` บังคับ · ปีนอกช่วง 1–20 / ไม่ใช่จำนวนเต็ม = 400
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getDataRetentionPolicy: vi.fn(),
  updateDataRetentionPolicy: vi.fn(),
  retentionYearsByOrganization: vi.fn(),
}))
vi.mock('@/lib/settings/queries/data-retention', () => queriesMock)

const route = await import('@/app/api/settings/data-retention/route')

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'บริหาร',
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

const EXECUTIVE = sessionUser({ id: 'exec-1', capabilities: { manage_data_retention: 'manage' } })
const SUPERADMIN = sessionUser({ id: 'sa-1', roleName: 'Superadmin', isSuperadmin: true })
const FINANCE = sessionUser({ id: 'fin-1', roleName: 'การเงิน', capabilities: { view_master_data: 'view' } })

function request(method: string, body?: unknown): NextRequest {
  const url = 'http://localhost/api/settings/data-retention'
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const CURRENT = { debtorDocumentRetentionYears: 5, updatedAt: null }

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const mock of Object.values(queriesMock)) mock.mockReset()
  queriesMock.getDataRetentionPolicy.mockResolvedValue(CURRENT)
  queriesMock.updateDataRetentionPolicy.mockImplementation(async (_context, _current, values) => ({
    ...values,
    updatedAt: '2026-10-06T00:00:00.000Z',
  }))
})

describe('GET/PATCH /api/settings/data-retention', () => {
  it('บริหารอ่านได้ — ยังไม่เคยตั้ง = ค่าเริ่มต้น 5 ปี', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    const response = await route.GET(request('GET'), {})
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: unknown }).data).toEqual(CURRENT)
  })

  it('บริหาร/Superadmin แก้ได้พร้อมเหตุผล — ส่งเหตุผลต่อให้ชั้นข้อมูลลง audit', async () => {
    for (const user of [EXECUTIVE, SUPERADMIN]) {
      requireSessionMock.mockResolvedValue(user)
      const response = await route.PATCH(
        request('PATCH', { debtorDocumentRetentionYears: 7, reason: 'ปรับตามนโยบายข้อมูลส่วนบุคคล' }),
        {},
      )
      expect(response.status).toBe(200)
    }
    expect(queriesMock.updateDataRetentionPolicy).toHaveBeenCalledTimes(2)
    const [context, current, values] = queriesMock.updateDataRetentionPolicy.mock.calls[0] ?? []
    expect(context).toMatchObject({ reason: 'ปรับตามนโยบายข้อมูลส่วนบุคคล' })
    expect(current).toEqual(CURRENT)
    expect(values).toEqual({ debtorDocumentRetentionYears: 7 })
  })

  it('ไม่มีสิทธิ์ (การเงิน) = 403 ทั้งอ่านและเขียน · ไม่แตะชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    expect((await route.GET(request('GET'), {})).status).toBe(403)
    const response = await route.PATCH(request('PATCH', { debtorDocumentRetentionYears: 3, reason: 'ทดสอบสิทธิ์' }), {})
    expect(response.status).toBe(403)
    expect(queriesMock.updateDataRetentionPolicy).not.toHaveBeenCalled()
  })

  it('ไม่มีเหตุผล / ปีนอกช่วง 1–20 / ไม่ใช่จำนวนเต็ม = 400', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    const bodies = [
      { debtorDocumentRetentionYears: 5 },
      { debtorDocumentRetentionYears: 0, reason: 'ทดสอบช่วง' },
      { debtorDocumentRetentionYears: 21, reason: 'ทดสอบช่วง' },
      { debtorDocumentRetentionYears: 2.5, reason: 'ทดสอบช่วง' },
    ]
    for (const body of bodies) {
      expect((await route.PATCH(request('PATCH', body), {})).status, JSON.stringify(body)).toBe(400)
    }
    expect(queriesMock.updateDataRetentionPolicy).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import { ROLE_USERS, roleUser } from '@/lib/dashboard/role-fixtures.test-helper'
import { FINANCE_ROLE_NAME } from '@/lib/auth/constants'

/**
 * เทสต์ระดับ route ของ `GET /api/billing-batches/preview` (mytester G-05 · รีวิวเฟส 4 ข้อ 3)
 *
 *  · ไม่ล็อกอิน = 401 · ไม่มี `manage_billing` = 403 — ไม่แตะ DB
 *  · query ไม่ครบ = 400
 *  · บริษัทที่ไม่อยู่ในองค์กร/นอก scope = 404 `COMPANY_NOT_FOUND` (ไม่ leak) และไม่อ่านรายได้
 *  · ปกติ = สรุปยอดที่จะดึงเข้ารอบ + ยอดหลังวันตัดรอบ
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const prismaMock = vi.hoisted(() => ({
  financeCompany: { findFirst: vi.fn(async (): Promise<unknown> => null) },
  revenue: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const { GET } = await import('@/app/api/billing-batches/preview/route')

const COMPANY_ID = '00000000-0000-4000-8000-00000000c001'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-00000000c002'

interface Envelope {
  success: boolean
  data?: {
    revenueCount: number
    totalSatang: number
    laterRevenueCount: number
    laterTotalSatang: number
    laterLatestRevenueDate: string | null
  }
  error: { code: string } | null
}

async function call(query: string): Promise<{ status: number; body: Envelope }> {
  const response = await GET(
    new Request(`http://localhost/api/billing-batches/preview?${query}`) as never,
    undefined as never,
  )
  return { status: response.status, body: (await response.json()) as Envelope }
}

function touchedDb(): boolean {
  return prismaMock.financeCompany.findFirst.mock.calls.length + prismaMock.revenue.findMany.mock.calls.length > 0
}

beforeEach(() => {
  requireSessionMock.mockReset()
  prismaMock.financeCompany.findFirst.mockReset()
  prismaMock.financeCompany.findFirst.mockResolvedValue(null)
  prismaMock.revenue.findMany.mockReset()
  prismaMock.revenue.findMany.mockResolvedValue([])
})

describe('GET /api/billing-batches/preview — สิทธิ์', () => {
  it('ไม่ได้ล็อกอิน = 401 และไม่แตะ DB', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    const { status } = await call(`companyId=${COMPANY_ID}&cutoffDate=2026-10-10`)
    expect(status).toBe(401)
    expect(touchedDb()).toBe(false)
  })

  it.each([
    ['บัญชี', ROLE_USERS.accounting],
    ['ผู้จัดการทีม', ROLE_USERS.manager],
    ['พนักงานภาคสนาม', ROLE_USERS.fieldAgent],
  ])('%s (ไม่มี manage_billing) = 403 PERMISSION_DENIED และไม่แตะ DB', async (_label, makeUser) => {
    requireSessionMock.mockResolvedValue(makeUser())
    const { status, body } = await call(`companyId=${COMPANY_ID}&cutoffDate=2026-10-10`)
    expect(status).toBe(403)
    expect(body.error?.code).toBe('PERMISSION_DENIED')
    expect(touchedDb()).toBe(false)
  })
})

describe('GET /api/billing-batches/preview — ข้อมูล', () => {
  it('ไม่ส่งวันตัดรอบ = 400 ไม่แตะ DB', async () => {
    requireSessionMock.mockResolvedValue(ROLE_USERS.finance())
    const { status } = await call(`companyId=${COMPANY_ID}`)
    expect(status).toBe(400)
    expect(touchedDb()).toBe(false)
  })

  it('บริษัทไม่อยู่ในองค์กร = 404 COMPANY_NOT_FOUND · ค้นด้วยองค์กรของผู้ใช้ · ไม่อ่านรายได้', async () => {
    requireSessionMock.mockResolvedValue(ROLE_USERS.finance())
    const { status, body } = await call(`companyId=${OTHER_COMPANY_ID}&cutoffDate=2026-10-10`)
    expect(status).toBe(404)
    expect(body.error?.code).toBe('COMPANY_NOT_FOUND')
    expect(prismaMock.financeCompany.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: OTHER_COMPANY_ID, organizationId: 'org-1', deletedAt: null }),
      }),
    )
    expect(prismaMock.revenue.findMany).not.toHaveBeenCalled()
  })

  it('ผู้ใช้ scope บริษัทเดียวขอบริษัทอื่น = 404 COMPANY_NOT_FOUND (where ไม่มีทางแมตช์ ไม่ใช่ error)', async () => {
    requireSessionMock.mockResolvedValue(
      roleUser(FINANCE_ROLE_NAME, 'system', 'company', {
        companyId: COMPANY_ID,
        scope: { kind: 'company', teamIds: [], companyId: COMPANY_ID, userId: 'user-1' },
      }),
    )
    const { status, body } = await call(`companyId=${OTHER_COMPANY_ID}&cutoffDate=2026-10-10`)
    expect(status).toBe(404)
    expect(body.error?.code).toBe('COMPANY_NOT_FOUND')
    expect(prismaMock.financeCompany.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: [] } }) }),
    )
    expect(prismaMock.revenue.findMany).not.toHaveBeenCalled()
  })

  it('ปกติ = สรุปยอดถึงวันตัดรอบ + ยอดหลังวันตัดรอบ', async () => {
    requireSessionMock.mockResolvedValue(ROLE_USERS.finance())
    prismaMock.financeCompany.findFirst.mockResolvedValue({ id: COMPANY_ID })
    prismaMock.revenue.findMany.mockResolvedValue([
      { revenueDate: new Date('2026-10-05T00:00:00Z'), grossSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 },
      { revenueDate: new Date('2026-10-10T00:00:00Z'), grossSatang: 50_000, vatSatang: 3_500, totalSatang: 53_500 },
      { revenueDate: new Date('2026-10-12T00:00:00Z'), grossSatang: 20_000, vatSatang: 1_400, totalSatang: 21_400 },
    ])
    const { status, body } = await call(`companyId=${COMPANY_ID}&cutoffDate=2026-10-10`)
    expect(status).toBe(200)
    expect(body.data).toEqual({
      revenueCount: 2,
      totalSatang: 160_500,
      laterRevenueCount: 1,
      laterTotalSatang: 21_400,
      laterLatestRevenueDate: '2026-10-12',
    })
  })
})

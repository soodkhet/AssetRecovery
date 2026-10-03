import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของบริษัทไฟแนนซ์ — **UAT BUG-001** (มติ PO 03/10/2569)
 *
 * พิสูจน์ว่า `vatMode` + `whtWithheldByCustomerPct` เดินทางจาก body → Zod → service ครบ
 * (เดิม Zod ตัดทิ้งเงียบ ๆ ⇒ สร้างบริษัท "ไม่หักภาษี/ราคารวม VAT" ไม่ได้) · ค่าที่ผิดขอบเขต = 400
 * และสิทธิ์ยังเป็น `manage:manage_companies` (Superadmin — `10` §12 · DEC-002)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listFinanceCompanies: vi.fn(),
  getFinanceCompany: vi.fn(),
  createFinanceCompany: vi.fn(),
  updateFinanceCompany: vi.fn(),
}))
vi.mock('@/lib/finance-companies/queries', () => queriesMock)

const collectionRoute = await import('@/app/api/finance-companies/route')
const itemRoute = await import('@/app/api/finance-companies/[id]/route')

const COMPANY_ID = '00000000-0000-4000-8000-0000000b0101'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000b0102'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>, isSuperadmin = false): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'admin@example.com',
    fullName: 'ผู้ใช้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: isSuperadmin ? 'Superadmin' : 'การเงิน',
    roleGroup: 'system',
    isSuperadmin,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const SUPERADMIN = sessionUser({}, true)
/** การเงินดูข้อมูลบริษัทได้อย่างเดียว (`10` §5) */
const FINANCE = sessionUser({ view_master_data: 'view' })

function jsonRequest(url: string, method: 'POST' | 'PATCH', body: unknown): NextRequest {
  const base = new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const baseBody = {
  name: 'บริษัท ทดสอบไฟแนนซ์ จำกัด',
  shortName: 'TF',
  taxId: '0105512345678',
  serviceFeeTemplateId: TEMPLATE_ID,
  reason: 'เพิ่มบริษัทคู่ค้าใหม่ (ไม่หักภาษี ราคารวม VAT)',
}

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const fn of Object.values(queriesMock)) fn.mockReset()
})

describe('POST /api/finance-companies — รูปแบบ VAT + อัตราที่ลูกค้าหัก', () => {
  it('ส่ง null (ไม่หัก) + include_vat → service ได้ค่าตรงตามที่ส่ง ไม่ถูกเติม default ทับ', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.createFinanceCompany.mockResolvedValue({ id: COMPANY_ID })

    const response = await collectionRoute.POST(
      jsonRequest('http://localhost/api/finance-companies', 'POST', {
        ...baseBody,
        vatMode: 'include_vat',
        whtWithheldByCustomerPct: null,
      }),
      undefined,
    )

    expect(response.status).toBe(201)
    const [ctx, values] = queriesMock.createFinanceCompany.mock.calls[0] as [
      { reason: string },
      Record<string, unknown>,
    ]
    expect(ctx.reason).toBe(baseBody.reason)
    expect(values.vatMode).toBe('include_vat')
    expect(values.whtWithheldByCustomerPct).toBeNull()
    expect(values).not.toHaveProperty('reason')
  })

  it('ไม่ส่ง 2 ช่องนี้ → ใช้ default ของ DB (exclude_vat · 3.00) เหมือนพฤติกรรมเดิม', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.createFinanceCompany.mockResolvedValue({ id: COMPANY_ID })

    await collectionRoute.POST(jsonRequest('http://localhost/api/finance-companies', 'POST', baseBody), undefined)

    const values = queriesMock.createFinanceCompany.mock.calls[0]?.[1] as Record<string, unknown>
    expect(values.vatMode).toBe('exclude_vat')
    expect(values.whtWithheldByCustomerPct).toBe(3)
  })

  it('อัตราเกิน 100 / ทศนิยมเกิน 2 ตำแหน่ง / vat_mode ที่ไม่มีจริง → 400 ไม่ถึง service', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)

    for (const extra of [{ whtWithheldByCustomerPct: 101 }, { whtWithheldByCustomerPct: 3.125 }, { vatMode: 'vat7' }]) {
      const response = await collectionRoute.POST(
        jsonRequest('http://localhost/api/finance-companies', 'POST', { ...baseBody, ...extra }),
        undefined,
      )
      expect(response.status).toBe(400)
    }
    expect(queriesMock.createFinanceCompany).not.toHaveBeenCalled()
  })

  it('การเงิน (view อย่างเดียว) สร้างบริษัทไม่ได้ = 403 (DEC-002)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)

    const response = await collectionRoute.POST(
      jsonRequest('http://localhost/api/finance-companies', 'POST', { ...baseBody, whtWithheldByCustomerPct: null }),
      undefined,
    )

    expect(response.status).toBe(403)
    expect(queriesMock.createFinanceCompany).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/finance-companies/:id', () => {
  it('แก้เป็นไม่หัก + no_vat → service ได้ค่าใหม่ครบ', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const current = { id: COMPANY_ID, vatMode: 'exclude_vat', whtWithheldByCustomerPct: 3 }
    queriesMock.getFinanceCompany.mockResolvedValue(current)
    queriesMock.updateFinanceCompany.mockResolvedValue({ id: COMPANY_ID })

    const response = await itemRoute.PATCH(
      jsonRequest(`http://localhost/api/finance-companies/${COMPANY_ID}`, 'PATCH', {
        ...baseBody,
        vatMode: 'no_vat',
        whtWithheldByCustomerPct: null,
      }),
      params(COMPANY_ID),
    )

    expect(response.status).toBe(200)
    const [, passedCurrent, values] = queriesMock.updateFinanceCompany.mock.calls[0] as [
      unknown,
      unknown,
      Record<string, unknown>,
    ]
    expect(passedCurrent).toBe(current)
    expect(values.vatMode).toBe('no_vat')
    expect(values.whtWithheldByCustomerPct).toBeNull()
  })
})

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'

/**
 * มติ PO 05/10/2569 (U6/O43 D2 · `06` v2.6 §7.2 · `97` §11) — ผู้ใช้บริษัทไฟแนนซ์ใช้พอร์ทัลทางเดียว
 * route ภายในตัวแทน (ที่เดิมเปิดให้บริษัทผ่าน `view_own_company_data` + scope company · R10v3) ต้องตอบ 403
 * **แม้ role ถูกผูก capability ภายในไว้** และต้องไม่แตะฐานข้อมูลเลย
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

// แตะ DB = ผิด — route ต้องปฏิเสธก่อนถึงชั้นข้อมูล
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`prisma.${String(prop)} ถูกเรียกทั้งที่ควรถูกปฏิเสธก่อน`)
      },
    },
  ),
}))

const COMPANY_ID = '00000000-0000-4000-8000-00000000c0a1'
const USER_ID = '00000000-0000-4000-8000-00000000c0b1'

const COMPANY_USER: SessionUser = {
  id: USER_ID,
  organizationId: '00000000-0000-4000-8000-0000000000aa',
  supabaseUid: 'uid-company',
  email: 'manager@finance.example',
  fullName: 'ผู้จัดการ บริษัทไฟแนนซ์',
  status: 'active',
  roleId: 'role-company-manager',
  roleName: 'ผู้จัดการ',
  roleGroup: 'finance_company',
  isSuperadmin: false,
  teamId: null,
  companyId: COMPANY_ID,
  // capability ภายในที่ Superadmin อาจผูกให้ — ต้องไม่มีผลกับผู้ใช้บริษัท
  capabilities: {
    view_own_company_data: 'view',
    view_master_data: 'view',
    manage_billing: 'manage',
    record_admin_data: 'manage',
    portal_cases: 'view',
    portal_finance: 'view',
  },
  scope: { kind: 'company', teamIds: [], companyId: COMPANY_ID, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const ID = '00000000-0000-4000-8000-0000000000d1'

function get(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'GET' })
}

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

type Handler = (request: NextRequest, context: never) => Promise<Response>

interface RouteCase {
  name: string
  load: () => Promise<Handler>
  request: () => NextRequest
  withId?: boolean
}

const ROUTES: RouteCase[] = [
  { name: 'GET /api/cases', load: async () => (await import('@/app/api/cases/route')).GET as Handler, request: () => get('/api/cases') },
  {
    name: 'GET /api/cases/:id',
    load: async () => (await import('@/app/api/cases/[id]/route')).GET as Handler,
    request: () => get(`/api/cases/${ID}`),
    withId: true,
  },
  { name: 'GET /api/assets', load: async () => (await import('@/app/api/assets/route')).GET as Handler, request: () => get('/api/assets') },
  {
    name: 'GET /api/handover-lots',
    load: async () => (await import('@/app/api/handover-lots/route')).GET as Handler,
    request: () => get('/api/handover-lots'),
  },
  { name: 'GET /api/revenues', load: async () => (await import('@/app/api/revenues/route')).GET as Handler, request: () => get('/api/revenues') },
  {
    name: 'GET /api/billing-batches',
    load: async () => (await import('@/app/api/billing-batches/route')).GET as Handler,
    request: () => get('/api/billing-batches'),
  },
  { name: 'GET /api/ar-aging', load: async () => (await import('@/app/api/ar-aging/route')).GET as Handler, request: () => get('/api/ar-aging') },
  {
    name: 'GET /api/finance-companies',
    load: async () => (await import('@/app/api/finance-companies/route')).GET as Handler,
    request: () => get('/api/finance-companies'),
  },
  {
    name: 'POST /api/storage/download-url',
    load: async () => (await import('@/app/api/storage/download-url/route')).POST as Handler,
    request: () => post('/api/storage/download-url', { path: `cases/${ID}/contract_doc/a.pdf` }),
  },
  { name: 'GET /api/meta/menu', load: async () => (await import('@/app/api/meta/menu/route')).GET as Handler, request: () => get('/api/meta/menu') },
  {
    name: 'GET /api/notifications',
    load: async () => (await import('@/app/api/notifications/route')).GET as Handler,
    request: () => get('/api/notifications'),
  },
  { name: 'GET /api/reports', load: async () => (await import('@/app/api/reports/route')).GET as Handler, request: () => get('/api/reports') },
]

beforeEach(() => {
  requireSessionMock.mockReset()
  requireSessionMock.mockResolvedValue(COMPANY_USER)
})

describe('ผู้ใช้บริษัทไฟแนนซ์ถูกตัดออกจาก route ภายใน (มติ O43 D2)', () => {
  it('มี route ตัวแทนอย่างน้อย 8 ตัว', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(8)
  })

  it.each(ROUTES.map((route) => [route.name, route] as const))('%s → 403 PERMISSION_DENIED', async (_name, route) => {
    const handler = await route.load()
    const context = route.withId === true ? { params: Promise.resolve({ id: ID }) } : {}
    const response = await handler(route.request(), context as never)
    expect(response.status).toBe(403)
    expect(JSON.stringify(await response.json())).toContain('PERMISSION_DENIED')
  })
})

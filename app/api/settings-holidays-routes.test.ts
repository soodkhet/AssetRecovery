import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของปฏิทินวันหยุด (มติ PO 06/10/2569 UAT U93)
 *
 * ใช้ `requirePermission()` ตัวจริง (mock แค่ session + ชั้นข้อมูล):
 *  · อ่าน = `manage_holidays` ระดับ view (บริหาร) · เพิ่ม/นำเข้า/ลบ = manage (ธุรการ/บัญชี/การเงิน)
 *  · ไม่มีสิทธิ์ (เช่น เจ้าหน้าที่อนุมัติเคส) = 403 ทั้งอ่านและเขียน · บริหาร (view) เขียนไม่ได้
 *  · `reason` บังคับ (กระทบกำหนดยื่นภาษี) · วันที่ผิดรูปแบบ = 400 · ไม่แตะชั้นข้อมูลเมื่อถูกปฏิเสธ
 * การเขียน DB + audit + คิดกำหนดยื่นใหม่ อยู่ใน `lib/wht/wht.db.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listHolidays: vi.fn(),
  getHoliday: vi.fn(),
  createHoliday: vi.fn(),
  importHolidays: vi.fn(),
  deleteHoliday: vi.fn(),
}))
vi.mock('@/lib/settings/queries/holidays', () => queriesMock)

const listRoute = await import('@/app/api/settings/holidays/route')
const importRoute = await import('@/app/api/settings/holidays/import/route')
const itemRoute = await import('@/app/api/settings/holidays/[id]/route')

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ธุรการ',
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

const ADMIN_OFFICE = sessionUser({ id: 'admin-1', capabilities: { manage_holidays: 'manage' } })
const ACCOUNTING = sessionUser({ id: 'acc-1', roleName: 'บัญชี', capabilities: { manage_holidays: 'manage' } })
const EXECUTIVE = sessionUser({ id: 'exec-1', roleName: 'บริหาร', capabilities: { manage_holidays: 'view' } })
const CASE_APPROVER = sessionUser({ id: 'ca-1', roleName: 'เจ้าหน้าที่อนุมัติเคส', capabilities: { view_master_data: 'view' } })

const REASON = 'ประกาศวันหยุดราชการประจำปี'

function request(method: string, path: string, body?: unknown): NextRequest {
  const url = `http://localhost${path}`
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const itemContext = { params: Promise.resolve({ id: 'holiday-1' }) }

interface Envelope {
  data?: unknown
  error?: { code: string } | null
}

const EMPTY_RESULT = { created: [], skippedDates: [], deleted: null, refreshedFilings: [] }

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const mock of Object.values(queriesMock)) mock.mockReset()
})

describe('สิทธิ์ปฏิทินวันหยุด', () => {
  it('ธุรการ (manage) เพิ่มวันหยุดได้ — วันที่เป็นเที่ยงคืน UTC + เหตุผลลงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    queriesMock.createHoliday.mockResolvedValue(EMPTY_RESULT)

    const response = await listRoute.POST(
      request('POST', '/api/settings/holidays', { holidayDate: '2026-12-31', name: 'วันสิ้นปี', reason: REASON }),
      undefined,
    )
    expect(response.status).toBe(201)
    const [context, values] = queriesMock.createHoliday.mock.calls[0] as [
      { actor: SessionUser; reason: string },
      { holidayDate: Date; name: string },
    ]
    expect(context.actor.id).toBe(ADMIN_OFFICE.id)
    expect(context.reason).toBe(REASON)
    expect(values.holidayDate.toISOString()).toBe('2026-12-31T00:00:00.000Z')
    expect(values).not.toHaveProperty('reason')
  })

  it('บัญชี (manage) นำเข้าหลายวันและลบได้', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    queriesMock.importHolidays.mockResolvedValue(EMPTY_RESULT)
    queriesMock.getHoliday.mockResolvedValue({ id: 'holiday-1', holidayDate: '2026-12-31', name: 'วันสิ้นปี' })
    queriesMock.deleteHoliday.mockResolvedValue(EMPTY_RESULT)

    const imported = await importRoute.POST(
      request('POST', '/api/settings/holidays/import', {
        items: [
          { holidayDate: '2027-01-01', name: 'วันขึ้นปีใหม่' },
          { holidayDate: '2027-04-13', name: 'วันสงกรานต์' },
        ],
        reason: REASON,
      }),
      undefined,
    )
    expect(imported.status).toBe(201)
    const [, items] = queriesMock.importHolidays.mock.calls[0] as [unknown, { holidayDate: Date }[]]
    expect(items.map((item) => item.holidayDate.toISOString())).toEqual([
      '2027-01-01T00:00:00.000Z',
      '2027-04-13T00:00:00.000Z',
    ])

    const removed = await itemRoute.DELETE(
      request('DELETE', '/api/settings/holidays/holiday-1', { reason: 'ใส่วันผิด' }),
      itemContext,
    )
    expect(removed.status).toBe(200)
    expect(queriesMock.getHoliday).toHaveBeenCalledWith('org-1', 'holiday-1')
    expect(queriesMock.deleteHoliday).toHaveBeenCalledTimes(1)
  })

  it('บริหาร (view) อ่านได้ แต่เพิ่ม/นำเข้า/ลบไม่ได้ = 403', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    queriesMock.listHolidays.mockResolvedValue({ items: [], years: [] })

    const read = await listRoute.GET(request('GET', '/api/settings/holidays?yearBe=2569'), undefined)
    expect(read.status).toBe(200)
    expect(queriesMock.listHolidays).toHaveBeenCalledWith('org-1', 2569)

    const write = await listRoute.POST(
      request('POST', '/api/settings/holidays', { holidayDate: '2026-12-31', name: 'วันสิ้นปี', reason: REASON }),
      undefined,
    )
    expect(write.status).toBe(403)
    expect(((await write.json()) as Envelope).error?.code).toBe('PERMISSION_DENIED')
    const imported = await importRoute.POST(
      request('POST', '/api/settings/holidays/import', { items: [{ holidayDate: '2027-01-01', name: 'ปีใหม่' }], reason: REASON }),
      undefined,
    )
    expect(imported.status).toBe(403)
    const removed = await itemRoute.DELETE(request('DELETE', '/api/settings/holidays/holiday-1', { reason: REASON }), itemContext)
    expect(removed.status).toBe(403)
    expect(queriesMock.createHoliday).not.toHaveBeenCalled()
    expect(queriesMock.importHolidays).not.toHaveBeenCalled()
    expect(queriesMock.deleteHoliday).not.toHaveBeenCalled()
  })

  it('ไม่มีสิทธิ์ปฏิทินวันหยุด (เจ้าหน้าที่อนุมัติเคส) อ่านก็ไม่ได้ = 403', async () => {
    requireSessionMock.mockResolvedValue(CASE_APPROVER)
    const read = await listRoute.GET(request('GET', '/api/settings/holidays'), undefined)
    expect(read.status).toBe(403)
    expect(queriesMock.listHolidays).not.toHaveBeenCalled()
  })

  it('ไม่มีเหตุผล / วันที่ไม่มีจริง / นำเข้าว่าง = 400 และไม่แตะชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const noReason = await listRoute.POST(
      request('POST', '/api/settings/holidays', { holidayDate: '2026-12-31', name: 'วันสิ้นปี', reason: '' }),
      undefined,
    )
    expect(noReason.status).toBe(400)
    const badDate = await listRoute.POST(
      request('POST', '/api/settings/holidays', { holidayDate: '2026-02-30', name: 'ไม่มีวันนี้', reason: REASON }),
      undefined,
    )
    expect(badDate.status).toBe(400)
    const empty = await importRoute.POST(request('POST', '/api/settings/holidays/import', { items: [], reason: REASON }), undefined)
    expect(empty.status).toBe(400)
    const noDeleteReason = await itemRoute.DELETE(request('DELETE', '/api/settings/holidays/holiday-1', {}), itemContext)
    expect(noDeleteReason.status).toBe(400)
    expect(queriesMock.createHoliday).not.toHaveBeenCalled()
    expect(queriesMock.importHolidays).not.toHaveBeenCalled()
    expect(queriesMock.deleteHoliday).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของศูนย์แจ้งเตือน (`90` §14)
 *
 * สิ่งที่ pure module ตรวจแทนไม่ได้:
 *  · endpoint ทั้งสามต้อง **ต้องล็อกอิน** (401 เมื่อไม่มี session) แต่ **ไม่ผูก capability** —
 *    ทุก role ต้องอ่านกล่องของตัวเองได้ (พนักงานภาคสนามที่ไม่มีสิทธิ์อะไรในหลังบ้านก็ต้องผ่าน)
 *  · service ถูกเรียกด้วย **ผู้ใช้จาก session เสมอ** (ไม่มีทางส่ง user_id ของคนอื่นเข้ามา)
 *  · `PATCH /:id/read` แตะเฉพาะ id นั้น · `read-all` ไม่ส่ง ids (= ทั้งกล่องของตัวเอง)
 *  · query filter นอกสเปค = 400 ไม่ใช่ 500
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
}))
vi.mock('@/lib/notifications/queries', () => queriesMock)

const listRoute = await import('@/app/api/notifications/route')
const { PATCH: markOneRead } = await import('@/app/api/notifications/[id]/read/route')
const { PATCH: markAllRead } = await import('@/app/api/notifications/read-all/route')

const NOTIFICATION_ID = '00000000-0000-4000-8000-0000000051f1'

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'agent@example.com',
    fullName: 'พนักงาน ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'พนักงานติดตามทรัพย์',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'self', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

/** พนักงานภาคสนามที่ไม่มี capability หลังบ้านเลย — ต้องยังอ่านกล่องของตัวเองได้ */
const FIELD_AGENT = sessionUser()

function request(url: string, method: 'GET' | 'PATCH' = 'GET'): NextRequest {
  const base = new Request(url, { method }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const EMPTY_LIST = { items: [], unreadCount: 0, totalCount: 0 }

interface Envelope {
  success: boolean
  data?: unknown
  error: { code: string } | null
}

async function envelopeOf(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.listNotifications.mockReset()
  queriesMock.markNotificationsRead.mockReset()
})

describe('สิทธิ์ของศูนย์แจ้งเตือน (`90` §12/§14)', () => {
  it('ไม่ได้ล็อกอิน = 401 ทั้งสาม endpoint และไม่แตะ service เลย', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))

    const responses = await Promise.all([
      listRoute.GET(request('http://localhost/api/notifications'), undefined),
      markOneRead(request(`http://localhost/api/notifications/${NOTIFICATION_ID}/read`, 'PATCH'), params(NOTIFICATION_ID)),
      markAllRead(request('http://localhost/api/notifications/read-all', 'PATCH'), undefined),
    ])

    for (const response of responses) expect(response.status).toBe(401)
    expect(queriesMock.listNotifications).not.toHaveBeenCalled()
    expect(queriesMock.markNotificationsRead).not.toHaveBeenCalled()
  })

  it('ล็อกอินแล้วแม้ไม่มี capability ใดเลยก็อ่าน/มาร์คกล่องตัวเองได้', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    queriesMock.listNotifications.mockResolvedValue(EMPTY_LIST)
    queriesMock.markNotificationsRead.mockResolvedValue({ updated: 1 })

    const list = await listRoute.GET(request('http://localhost/api/notifications'), undefined)
    const one = await markOneRead(
      request(`http://localhost/api/notifications/${NOTIFICATION_ID}/read`, 'PATCH'),
      params(NOTIFICATION_ID),
    )
    const all = await markAllRead(request('http://localhost/api/notifications/read-all', 'PATCH'), undefined)

    expect([list.status, one.status, all.status]).toEqual([200, 200, 200])
  })
})

describe('GET /api/notifications', () => {
  it('ส่งผู้ใช้จาก session เข้า service เสมอ + ค่า filter ปริยาย = all', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    queriesMock.listNotifications.mockResolvedValue(EMPTY_LIST)

    const response = await listRoute.GET(request('http://localhost/api/notifications'), undefined)

    expect(response.status).toBe(200)
    expect(queriesMock.listNotifications).toHaveBeenCalledWith(FIELD_AGENT, { filter: 'all' })
    expect((await envelopeOf(response)).data).toEqual(EMPTY_LIST)
  })

  it('รับ filter=unread และ limit', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    queriesMock.listNotifications.mockResolvedValue(EMPTY_LIST)

    await listRoute.GET(request('http://localhost/api/notifications?filter=unread&limit=10'), undefined)

    expect(queriesMock.listNotifications).toHaveBeenCalledWith(FIELD_AGENT, { filter: 'unread', limit: 10 })
  })

  it('filter นอกสเปค = 400 (ไม่ใช่ 500) และไม่เรียก service', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const response = await listRoute.GET(request('http://localhost/api/notifications?filter=archived'), undefined)

    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('REQUIRED_MISSING')
    expect(queriesMock.listNotifications).not.toHaveBeenCalled()
  })

  it('limit เกินเพดานถูกปฏิเสธที่ schema (กันดึงทั้งตาราง)', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const response = await listRoute.GET(request('http://localhost/api/notifications?limit=5000'), undefined)

    expect(response.status).toBe(400)
    expect(queriesMock.listNotifications).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/notifications/:id/read · read-all', () => {
  it('มาร์คทีละรายการ = ส่งเฉพาะ id นั้นเข้า service', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    queriesMock.markNotificationsRead.mockResolvedValue({ updated: 1 })

    const response = await markOneRead(
      request(`http://localhost/api/notifications/${NOTIFICATION_ID}/read`, 'PATCH'),
      params(NOTIFICATION_ID),
    )

    expect(response.status).toBe(200)
    expect(queriesMock.markNotificationsRead).toHaveBeenCalledWith(FIELD_AGENT, [NOTIFICATION_ID])
  })

  it('id ที่ไม่ใช่ UUID = 400 (ไม่ยิง query ด้วยค่ามั่ว)', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const response = await markOneRead(request('http://localhost/api/notifications/abc/read', 'PATCH'), params('abc'))

    expect(response.status).toBe(400)
    expect(queriesMock.markNotificationsRead).not.toHaveBeenCalled()
  })

  it('id ของคนอื่น = 200 + updated 0 (ไม่บอกใบ้ว่ามีแถวนั้นอยู่จริง)', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    queriesMock.markNotificationsRead.mockResolvedValue({ updated: 0 })

    const response = await markOneRead(
      request(`http://localhost/api/notifications/${NOTIFICATION_ID}/read`, 'PATCH'),
      params(NOTIFICATION_ID),
    )

    expect(response.status).toBe(200)
    expect((await envelopeOf(response)).data).toEqual({ updated: 0 })
  })

  it('read-all ไม่ส่ง ids (= ทั้งกล่องของผู้เรียกเอง)', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    queriesMock.markNotificationsRead.mockResolvedValue({ updated: 3 })

    const response = await markAllRead(request('http://localhost/api/notifications/read-all', 'PATCH'), undefined)

    expect(response.status).toBe(200)
    expect(queriesMock.markNotificationsRead).toHaveBeenCalledWith(FIELD_AGENT)
    expect((await envelopeOf(response)).data).toEqual({ updated: 3 })
  })
})

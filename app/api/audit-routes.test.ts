import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของหน้าบันทึกการใช้งาน (`90` §14/§16)
 *
 * สิ่งที่ pure module / เทสต์ระดับ DB ตรวจแทนไม่ได้:
 *  · ทั้งสอง endpoint ต้องผ่าน `requirePermission('view', 'view_audit_log')` ก่อนแตะ service (DEC-002)
 *  · **ไม่มี handler เขียนเลย** — audit immutable ห้ามแก้/ลบทุกกรณี (`02` §13)
 *  · id ที่ไม่มีจริง/อยู่คนละองค์กร = `AUDIT_LOG_NOT_FOUND` (404) ไม่ใช่ 403/500 — ไม่ leak
 *  · query filter นอกสเปค = 400 พร้อม field errors ไม่ใช่ 500
 */

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: requirePermissionMock,
  requireAnyPermission: requirePermissionMock,
}))

const queriesMock = vi.hoisted(() => ({ listAuditLogs: vi.fn(), getAuditLog: vi.fn() }))
vi.mock('@/lib/audit/log-queries', () => queriesMock)

const listRoute = await import('@/app/api/audit-logs/route')
const detailRoute = await import('@/app/api/audit-logs/[id]/route')

const LOG_ID = '00000000-0000-4000-8000-0000000052f1'

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'exec@example.com',
    fullName: 'ผู้บริหาร ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ผู้บริหาร',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { view_audit_log: 'view' },
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const EXECUTIVE = sessionUser()

const EMPTY_LIST = {
  items: [],
  total: 0,
  offset: 0,
  limit: 50,
  hasMore: false,
  targetTypes: [],
  actors: [],
}

function request(url: string, method = 'GET'): NextRequest {
  const base = new Request(url, { method }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

interface Envelope {
  success: boolean
  data?: unknown
  error: { code: string; fields?: unknown } | null
}

async function envelopeOf(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope
}

beforeEach(() => {
  requirePermissionMock.mockReset()
  queriesMock.listAuditLogs.mockReset()
  queriesMock.getAuditLog.mockReset()
})

describe('สิทธิ์ของบันทึกการใช้งาน (`90` §12/§14)', () => {
  it('ไม่มี capability = 403 ทั้งสอง endpoint และไม่แตะ service เลย', async () => {
    requirePermissionMock.mockRejectedValue(new AuthError('PERMISSION_DENIED'))

    const responses = await Promise.all([
      listRoute.GET(request('http://localhost/api/audit-logs'), undefined),
      detailRoute.GET(request(`http://localhost/api/audit-logs/${LOG_ID}`), params(LOG_ID)),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(queriesMock.listAuditLogs).not.toHaveBeenCalled()
    expect(queriesMock.getAuditLog).not.toHaveBeenCalled()
  })

  it('ไม่ได้ล็อกอิน = 401', async () => {
    requirePermissionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    const response = await listRoute.GET(request('http://localhost/api/audit-logs'), undefined)
    expect(response.status).toBe(401)
  })

  it('ตรวจสิทธิ์ด้วย view/view_audit_log เท่านั้น (`90` §12)', async () => {
    requirePermissionMock.mockResolvedValue(EXECUTIVE)
    queriesMock.listAuditLogs.mockResolvedValue(EMPTY_LIST)

    await listRoute.GET(request('http://localhost/api/audit-logs'), undefined)

    expect(requirePermissionMock).toHaveBeenCalledWith('view', 'view_audit_log')
  })
})

describe('อ่านอย่างเดียว (`02` §13 — audit immutable)', () => {
  it('ไฟล์ route ไม่ export handler ที่เขียนข้อมูลเลย', () => {
    for (const route of [listRoute, detailRoute]) {
      expect(Object.keys(route).sort()).toEqual(['GET'])
    }
  })
})

describe('พฤติกรรมของ endpoint', () => {
  it('id ที่ไม่มีจริง/อยู่คนละองค์กร = AUDIT_LOG_NOT_FOUND (404) ไม่ใช่ 403', async () => {
    requirePermissionMock.mockResolvedValue(EXECUTIVE)
    queriesMock.getAuditLog.mockResolvedValue(null)

    const response = await detailRoute.GET(request(`http://localhost/api/audit-logs/${LOG_ID}`), params(LOG_ID))

    expect(response.status).toBe(404)
    expect((await envelopeOf(response)).error?.code).toBe('AUDIT_LOG_NOT_FOUND')
  })

  it('ตัวกรองถูกส่งต่อให้ service พร้อมผู้ใช้จาก session เสมอ', async () => {
    requirePermissionMock.mockResolvedValue(EXECUTIVE)
    queriesMock.listAuditLogs.mockResolvedValue(EMPTY_LIST)

    await listRoute.GET(
      request('http://localhost/api/audit-logs?targetType=cases&actorId=00000000-0000-4000-8000-0000000052f9&dateFrom=2026-08-01'),
      undefined,
    )

    expect(queriesMock.listAuditLogs).toHaveBeenCalledWith(
      EXECUTIVE,
      expect.objectContaining({
        targetType: 'cases',
        actorId: '00000000-0000-4000-8000-0000000052f9',
        dateFrom: '2026-08-01',
      }),
    )
  })

  it('query นอกสเปค = 400 ไม่ใช่ 500', async () => {
    requirePermissionMock.mockResolvedValue(EXECUTIVE)

    const response = await listRoute.GET(request('http://localhost/api/audit-logs?action=archive'), undefined)

    expect(response.status).toBe(400)
    expect(queriesMock.listAuditLogs).not.toHaveBeenCalled()
  })
})

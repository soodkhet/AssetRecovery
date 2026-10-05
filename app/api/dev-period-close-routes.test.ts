import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * ทางลัด dev ส่ง/ล็อกงวดด้วยวันที่จำลอง (มติ PO 05/10/2569 U65 — แบบเดียวกับ asOf ของ O10)
 *  · production ⇒ 404 **ก่อน**ชั้นสิทธิ์ และไม่แตะ service
 *  · นอก production ⇒ สิทธิ์ชุดเดียวกับ route จริง (ไม่มีสิทธิ์ = 403) แล้วส่งวันจำลองให้ service
 *  · route จริงไม่รับเวลาจากผู้เรียก (asOf ถูกตัดทิ้ง)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock, loadSessionUser: vi.fn() }))

const queriesMock = vi.hoisted(() => ({ sendPeriod: vi.fn(), lockPeriod: vi.fn() }))
vi.mock('@/lib/accounting/queries', () => queriesMock)

const { POST: devSend } = await import('@/app/api/dev/accounting-periods/[id]/send/route')
const { POST: devLock } = await import('@/app/api/dev/accounting-periods/[id]/lock/route')
const { PATCH: realSend } = await import('@/app/api/accounting/periods/[id]/send/route')

const PERIOD_ID = '00000000-0000-4000-8000-000000000065'

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-acc',
    organizationId: 'org-1',
    supabaseUid: 'uid-acc',
    email: 'acc@example.com',
    fullName: 'บัญชี',
    status: 'active',
    roleId: 'role-acc',
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { manage_accounting_period: 'manage' },
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-acc' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const ACCOUNTANT = sessionUser()
const EXECUTIVE = sessionUser({ id: 'user-exec', roleName: 'บริหาร', capabilities: { unlock_period: 'manage' } })
const FINANCE = sessionUser({ id: 'user-fin', roleName: 'การเงิน', capabilities: { manage_billing: 'manage' } })

/** วันตามปฏิทินไทย (YYYY-MM-DD) ห่างจากวันนี้ n วัน */
function bangkokDayOffset(days: number): string {
  const todayBangkok = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  return new Date(new Date(`${todayBangkok}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

function request(url: string, method: 'POST' | 'PATCH', body: unknown): NextRequest {
  const base = new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: PERIOD_ID }) }
const body = (asOf: string) => ({ reason: 'ปิดงวดทดสอบ UAT', asOf })

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.sendPeriod.mockReset().mockResolvedValue({ id: PERIOD_ID, status: 'sent_to_accountant' })
  queriesMock.lockPeriod.mockReset().mockResolvedValue({ id: PERIOD_ID, status: 'locked' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/dev/accounting-periods/:id/(send|lock) — U65', () => {
  it('production ⇒ 404 ก่อนชั้นสิทธิ์ (ไม่ล็อกอินก็ไม่ได้ 401) และไม่แตะ service', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))

    const sent = await devSend(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/send`, 'POST', body(bangkokDayOffset(1))), params)
    const locked = await devLock(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/lock`, 'POST', body(bangkokDayOffset(1))), params)

    expect(sent.status).toBe(404)
    expect(locked.status).toBe(404)
    expect(requireSessionMock).not.toHaveBeenCalled()
    expect(queriesMock.sendPeriod).not.toHaveBeenCalled()
    expect(queriesMock.lockPeriod).not.toHaveBeenCalled()
  })

  it('dev: ส่งงวดได้ด้วยวันจำลอง — service ได้ simulatedNow = เที่ยงวันไทยของ asOf', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    const asOf = bangkokDayOffset(27)

    const response = await devSend(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/send`, 'POST', body(asOf)), params)

    expect(response.status).toBe(200)
    expect(queriesMock.sendPeriod).toHaveBeenCalledTimes(1)
    const [, periodId, input, now, simulation] = queriesMock.sendPeriod.mock.calls[0] ?? []
    expect(periodId).toBe(PERIOD_ID)
    expect(input).toEqual({ reason: 'ปิดงวดทดสอบ UAT' })
    expect(now).toBeInstanceOf(Date)
    expect((simulation as { simulatedNow: Date }).simulatedNow.toISOString()).toBe(`${asOf}T05:00:00.000Z`)
  })

  it('dev: ล็อกงวดได้ทั้งบัญชีและผู้บริหาร (สิทธิ์ชุดเดียวกับ route จริง)', async () => {
    for (const user of [ACCOUNTANT, EXECUTIVE]) {
      requireSessionMock.mockResolvedValue(user)
      const response = await devLock(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/lock`, 'POST', body(bangkokDayOffset(1))), params)
      expect(response.status).toBe(200)
    }
    expect(queriesMock.lockPeriod).toHaveBeenCalledTimes(2)
    expect(queriesMock.lockPeriod.mock.calls[0]?.[4]).toMatchObject({ simulatedNow: expect.any(Date) })
  })

  it('ไม่มีสิทธิ์ ⇒ 403 และไม่แตะ service · ผู้บริหารส่งงวดทางลัดไม่ได้เหมือน route จริง', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    const send = await devSend(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/send`, 'POST', body(bangkokDayOffset(1))), params)
    const lock = await devLock(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/lock`, 'POST', body(bangkokDayOffset(1))), params)
    expect(send.status).toBe(403)
    expect(lock.status).toBe(403)

    requireSessionMock.mockResolvedValue(EXECUTIVE)
    const execSend = await devSend(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/send`, 'POST', body(bangkokDayOffset(1))), params)
    expect(execSend.status).toBe(403)
    expect(queriesMock.sendPeriod).not.toHaveBeenCalled()
    expect(queriesMock.lockPeriod).not.toHaveBeenCalled()
  })

  it('asOf ผิดรูป/ย้อนหลัง/เกิน 31 วัน/ไม่ส่ง ⇒ 400 · ไม่มีเหตุผล ⇒ 400', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    for (const payload of [
      body('2569-11-01'),
      body(bangkokDayOffset(-1)),
      body(bangkokDayOffset(32)),
      { reason: 'ไม่มีวันจำลอง' },
      { asOf: bangkokDayOffset(1) },
    ]) {
      const response = await devSend(request(`http://localhost/api/dev/accounting-periods/${PERIOD_ID}/send`, 'POST', payload), params)
      expect(response.status).toBe(400)
    }
    expect(queriesMock.sendPeriod).not.toHaveBeenCalled()
  })

  it('route จริงไม่รับเวลาจากผู้เรียก — asOf ใน body ถูกตัดทิ้ง ไม่มีวันจำลองส่งต่อ', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    const response = await realSend(
      request(`http://localhost/api/accounting/periods/${PERIOD_ID}/send`, 'PATCH', body(bangkokDayOffset(27))),
      params,
    )
    expect(response.status).toBe(200)
    const call = queriesMock.sendPeriod.mock.calls[0] ?? []
    expect(call).toHaveLength(3)
    expect(call[2]).toEqual({ reason: 'ปิดงวดทดสอบ UAT' })
  })
})

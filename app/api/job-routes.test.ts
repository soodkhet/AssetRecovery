import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของงานเบื้องหลัง (`91` §14 · §14.1)
 *
 * สิ่งที่ pure module / เทสต์ระดับ DB ตรวจแทนไม่ได้:
 *  · ทุก endpoint ต้องผ่าน `requirePermission()` ก่อนแตะ service (DEC-002) — ไม่ล็อกอิน = 401
 *  · `POST /api/jobs` คีย์ซ้ำ = **200 + `duplicate: true`** (ไม่ใช่ 201 และไม่ใช่ error) ตาม `91` §11
 *  · **dev trigger ต้อง 404 ใน production เสมอ** (`91` §14.1 ข้อแรก) และไม่แตะ service เลย
 *  · dev trigger รับ job_type เฉพาะ 5 ตัวของ §6.1 — นอกรายการ = `JOB_INVALID_STATUS`
 *  · ตัวรันงานของ cron ต้องไม่เปิดให้ใครก็ยิงได้ตอน production ที่ไม่ได้ตั้ง `CRON_SECRET`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock, loadSessionUser: vi.fn() }))

const queriesMock = vi.hoisted(() => ({
  listJobs: vi.fn(),
  getJob: vi.fn(),
  createJob: vi.fn(),
  retryJob: vi.fn(),
}))
vi.mock('@/lib/jobs/queries', () => queriesMock)

const engineMock = vi.hoisted(() => ({
  runJobById: vi.fn(),
  enqueueScheduledJobs: vi.fn(),
  runDueJobs: vi.fn(),
  reclaimStaleJobs: vi.fn(),
}))
vi.mock('@/lib/jobs/engine', () => engineMock)

const registryMock = vi.hoisted(() => ({ runSweeperJobs: vi.fn() }))
vi.mock('@/lib/jobs/registry', () => registryMock)

const jobsRoute = await import('@/app/api/jobs/route')
const { GET: getJobRoute } = await import('@/app/api/jobs/[id]/route')
const { POST: retryRoute } = await import('@/app/api/jobs/[id]/retry/route')
const { POST: devTriggerRoute } = await import('@/app/api/dev/trigger-job/route')
const { GET: cronRoute } = await import('@/app/api/cron/jobs/route')

const JOB_ID = '00000000-0000-4000-8000-0000000053f1'

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
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
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const SUPERADMIN = sessionUser()

function request(url: string, method: 'GET' | 'POST' = 'GET', body?: unknown, headers?: Record<string, string>): NextRequest {
  const base = new Request(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }),
    ...(body === undefined && headers !== undefined ? { headers } : {}),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

interface Envelope {
  success: boolean
  data?: unknown
  error: { code: string } | null
}

async function envelopeOf(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope
}

const JOB_DETAIL = {
  id: JOB_ID,
  jobType: 'advance_overdue',
  jobTypeLabel: 'มาร์คเงินทดรองจ่ายที่เลยกำหนดเคลียร์',
  status: 'pending',
  retryCount: 0,
  maxRetries: 3,
  createdAt: '2026-08-15T10:00:00.000Z',
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  errorMessage: null,
  createdById: 'user-1',
  createdByName: 'ผู้ดูแลระบบ',
  payload: {},
  result: null,
  output: null,
}

/** vitest จัดการคืนค่า env ให้เองผ่าน `vi.unstubAllEnvs()` — เขียนทับ `process.env` ตรง ๆ ไม่ได้ */
function setNodeEnv(value: string): void {
  vi.stubEnv('NODE_ENV', value)
}

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const fn of Object.values(queriesMock)) fn.mockReset()
  for (const fn of Object.values(engineMock)) fn.mockReset()
  registryMock.runSweeperJobs.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('สิทธิ์ของ endpoint งานเบื้องหลัง (`91` §12)', () => {
  it('ไม่ได้ล็อกอิน = 401 ทุก endpoint และไม่แตะ service เลย', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))

    const responses = await Promise.all([
      jobsRoute.GET(request('http://localhost/api/jobs'), undefined),
      jobsRoute.POST(request('http://localhost/api/jobs', 'POST', { jobType: 'advance_overdue', idempotencyKey: 'k' }), undefined),
      getJobRoute(request(`http://localhost/api/jobs/${JOB_ID}`), params(JOB_ID)),
      retryRoute(request(`http://localhost/api/jobs/${JOB_ID}/retry`, 'POST', { reason: 'ลองใหม่' }), params(JOB_ID)),
      devTriggerRoute(request('http://localhost/api/dev/trigger-job', 'POST', { jobType: 'advance_overdue' }), undefined),
    ])

    for (const response of responses) expect(response.status).toBe(401)
    expect(queriesMock.listJobs).not.toHaveBeenCalled()
    expect(queriesMock.createJob).not.toHaveBeenCalled()
    expect(queriesMock.retryJob).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs (`91` §11/§14)', () => {
  it('สร้างใหม่ = 201 · คีย์ซ้ำ = 200 พร้อม duplicate: true (ไม่ใช่ error)', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.createJob.mockResolvedValueOnce({ job: JOB_DETAIL, duplicate: false })
    queriesMock.createJob.mockResolvedValueOnce({ job: JOB_DETAIL, duplicate: true })

    const body = { jobType: 'advance_overdue', idempotencyKey: 'advance:2026-08-15' }
    const created = await jobsRoute.POST(request('http://localhost/api/jobs', 'POST', body), undefined)
    const again = await jobsRoute.POST(request('http://localhost/api/jobs', 'POST', body), undefined)

    expect(created.status).toBe(201)
    expect(again.status).toBe(200)
    expect((await envelopeOf(again)).data).toMatchObject({ duplicate: true })
  })

  it('ไม่ส่งคีย์กันซ้ำ = 400 (บังคับตาม `01` §11) และไม่แตะ service', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)

    const response = await jobsRoute.POST(
      request('http://localhost/api/jobs', 'POST', { jobType: 'advance_overdue' }),
      undefined,
    )

    expect(response.status).toBe(400)
    expect(queriesMock.createJob).not.toHaveBeenCalled()
  })

  it('job_type นอกทะเบียน = 400 ไม่ใช่ 500', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)

    const response = await jobsRoute.POST(
      request('http://localhost/api/jobs', 'POST', { jobType: 'ทำอะไรก็ได้', idempotencyKey: 'k' }),
      undefined,
    )

    expect(response.status).toBe(400)
    expect(queriesMock.createJob).not.toHaveBeenCalled()
  })
})

describe('POST /api/dev/trigger-job (`91` §14.1)', () => {
  it('ตอบ 404 ใน production เสมอ และไม่สร้าง job', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    setNodeEnv('production')

    const response = await devTriggerRoute(
      request('http://localhost/api/dev/trigger-job', 'POST', { jobType: 'advance_overdue' }),
      undefined,
    )

    expect(response.status).toBe(404)
    expect(queriesMock.createJob).not.toHaveBeenCalled()
    expect(engineMock.runJobById).not.toHaveBeenCalled()
  })

  it('production: ตอบ 404 ก่อนชั้นสิทธิ์ — คนไม่ล็อกอินต้องไม่ได้ 401 (ไม่ใบ้ว่ามี route นี้)', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    setNodeEnv('production')

    const response = await devTriggerRoute(
      request('http://localhost/api/dev/trigger-job', 'POST', { jobType: 'advance_overdue' }),
      undefined,
    )

    expect(response.status).toBe(404)
    expect(requireSessionMock).not.toHaveBeenCalled()
  })

  it('นอก production: สร้าง job ผ่านทางเดียวกับ POST /api/jobs แล้วรันทันที', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.createJob.mockResolvedValue({ job: JOB_DETAIL, duplicate: false })
    queriesMock.getJob.mockResolvedValue({ ...JOB_DETAIL, status: 'completed' })
    engineMock.runJobById.mockResolvedValue('completed')

    const response = await devTriggerRoute(
      request('http://localhost/api/dev/trigger-job', 'POST', { jobType: 'advance_overdue' }),
      undefined,
    )

    expect(response.status).toBe(200)
    expect(queriesMock.createJob).toHaveBeenCalledTimes(1)
    // ต้องมีคีย์กันซ้ำเสมอ ไม่ใช่ shortcut ที่ข้าม flow ปกติ (`91` §14.1)
    expect(queriesMock.createJob.mock.calls[0]?.[1]).toMatchObject({ jobType: 'advance_overdue' })
    expect(String(queriesMock.createJob.mock.calls[0]?.[1]?.idempotencyKey)).toContain('dev:advance_overdue')
    expect(engineMock.runJobById).toHaveBeenCalledWith(JOB_ID, expect.any(Date))
    expect((await envelopeOf(response)).data).toMatchObject({ outcome: 'completed' })
  })

  it('job_type ที่อยู่ในทะเบียนแต่ไม่อยู่ใน §6.1 = JOB_INVALID_STATUS', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)

    const response = await devTriggerRoute(
      request('http://localhost/api/dev/trigger-job', 'POST', { jobType: 'wht_filing_reminder' }),
      undefined,
    )

    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('JOB_INVALID_STATUS')
    expect(queriesMock.createJob).not.toHaveBeenCalled()
  })
})

describe('GET /api/cron/jobs (`91` §17 · DEC-001)', () => {
  it('production ที่ไม่ได้ตั้ง CRON_SECRET = 401 ไม่รันอะไรเลย', async () => {
    setNodeEnv('production')
    vi.stubEnv('CRON_SECRET', '')

    const response = await cronRoute(request('http://localhost/api/cron/jobs'))

    expect(response.status).toBe(401)
    expect(engineMock.runDueJobs).not.toHaveBeenCalled()
  })

  it('ตั้ง CRON_SECRET แล้วต้องส่ง Bearer ให้ตรงเท่านั้น', async () => {
    setNodeEnv('production')
    vi.stubEnv('CRON_SECRET', 'cron-secret-53')
    engineMock.enqueueScheduledJobs.mockResolvedValue({ enqueued: 2, duplicated: 0 })
    engineMock.runDueJobs.mockResolvedValue({ picked: 1, completed: 1, retryScheduled: 0, deadLettered: 0, skipped: 0 })
    engineMock.reclaimStaleJobs.mockResolvedValue(0)
    registryMock.runSweeperJobs.mockResolvedValue({ fuelDistance: { claimed: 0, created: 0, skippedZero: 0, deferred: 0 } })

    const denied = await cronRoute(request('http://localhost/api/cron/jobs', 'GET', undefined, { authorization: 'Bearer wrong-secret' }))
    expect(denied.status).toBe(401)

    const allowed = await cronRoute(
      request('http://localhost/api/cron/jobs', 'GET', undefined, { authorization: 'Bearer cron-secret-53' }),
    )
    expect(allowed.status).toBe(200)
    expect((await envelopeOf(allowed)).data).toMatchObject({ enqueued: 2, picked: 1, completed: 1 })
    expect(registryMock.runSweeperJobs).toHaveBeenCalledTimes(1)
  })
})

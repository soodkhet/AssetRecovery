import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/errors'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import { clearReportCache } from '@/lib/reports/cache'
import type { ReportData } from '@/lib/reports/payload'
import { REPORT_PROVIDERS } from '@/lib/reports/providers'

/**
 * เทสต์ระดับ route ของเมนูรายงาน (`96` §9–§12)
 *
 * สิ่งที่ pure module ตรวจแทนไม่ได้:
 *  · ทุก endpoint ต้องผ่าน `requireSession()` ก่อนแตะข้อมูล (DEC-002) — ไม่ล็อกอิน = 401
 *  · **การเงินเรียกรายงาน Executive ต้อง 403** (`96` §14) ทั้งทางอ่านและทางส่งออก
 *  · id รายงานที่ไม่มีจริง = 404 `REPORT_NOT_FOUND` (ไม่ใช่ 500)
 *  · custom range ที่กลับหัว = 400 `REPORT_DATE_INVALID` (`96` §12)
 *  · export ที่เกิน 5,000 แถว = **202 + jobId** ไม่ใช่ไฟล์ (E13)
 *  · `GET /api/reports` คืนเฉพาะรายงานที่ผู้เรียกมีสิทธิ์ (ไม่ leak ชื่อรายงานของหมวดอื่น)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock, loadSessionUser: vi.fn() }))

const enqueueJobMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/jobs/engine', () => ({ enqueueJob: enqueueJobMock }))

const { GET: catalogRoute } = await import('@/app/api/reports/route')
const { GET: reportRoute } = await import('@/app/api/reports/[reportId]/route')
const { POST: refreshRoute } = await import('@/app/api/reports/[reportId]/refresh/route')
const { POST: exportRoute } = await import('@/app/api/reports/[reportId]/export/route')

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'finance@example.com',
    fullName: 'เจ้าหน้าที่การเงิน',
    status: 'active',
    roleId: 'role-1',
    roleName: 'การเงิน',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { manage_billing: 'manage' },
    scope: resolveScope({
      userId: 'user-1',
      roleGroup: 'system',
      roleName: 'การเงิน',
      teamId: null,
      companyId: null,
      managedTeamIds: [],
      supervisedTeamIds: [],
    }),
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const FINANCE = sessionUser()
const EXECUTIVE = sessionUser({
  id: 'user-2',
  roleName: 'บริหาร',
  capabilities: { unlock_period: 'manage', authorize_exception: 'manage' },
})

function request(url: string, method: 'GET' | 'POST' = 'GET', body?: unknown): NextRequest {
  const base = new Request(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (reportId: string) => ({ params: Promise.resolve({ reportId }) })

interface Envelope {
  success: boolean
  data?: unknown
  error: { code: string } | null
}

async function envelopeOf(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope
}

function data(rows: number): ReportData {
  return {
    columns: [{ key: 'name', header: 'ชื่อ', type: 'text' }],
    rows: Array.from({ length: rows }, (_, index) => ({ name: `แถว ${index}` })),
  }
}

beforeEach(() => {
  requireSessionMock.mockReset()
  enqueueJobMock.mockReset()
  clearReportCache()
})

/** ทะเบียนจริง (หมวด F เปิดใช้งานแล้วตั้งแต่ 6.2) — คืนสภาพหลังทุกเทสต์ */
const ORIGINAL_PROVIDERS = { ...REPORT_PROVIDERS }

afterEach(() => {
  for (const key of Object.keys(REPORT_PROVIDERS)) delete REPORT_PROVIDERS[key]
  Object.assign(REPORT_PROVIDERS, ORIGINAL_PROVIDERS)
})

describe('GET /api/reports (ทะเบียนรายงานของผู้เรียก)', () => {
  it('ไม่ล็อกอิน = 401 ไม่แตะข้อมูล', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    const response = await catalogRoute(request('http://localhost/api/reports'), undefined)
    expect(response.status).toBe(401)
  })

  it('การเงินเห็นเฉพาะหมวด F (ไม่เห็นชื่อรายงานหมวด A/E)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    const envelope = await envelopeOf(await catalogRoute(request('http://localhost/api/reports'), undefined))
    const reports = (envelope.data as { reports: Array<{ code: string; available: boolean }> }).reports

    expect(reports.map((report) => report.code)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    // 6.2 เปิดใช้งานหมวด F ครบทั้ง 5 ตัวแล้ว (หมวดอื่นยังทยอยเปิดใน 6.3–6.5)
    expect(reports.every((report) => report.available)).toBe(true)
  })

  it('ผู้บริหารเห็นครบ 17 ตัว', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    const envelope = await envelopeOf(await catalogRoute(request('http://localhost/api/reports'), undefined))
    expect((envelope.data as { reports: unknown[] }).reports).toHaveLength(17)
  })
})

describe('GET /api/reports/:id', () => {
  it('รายงานที่ไม่มีในทะเบียน = 404 REPORT_NOT_FOUND', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    const response = await reportRoute(request('http://localhost/api/reports/ไม่มีจริง'), params('ไม่มีจริง'))
    expect(response.status).toBe(404)
    expect((await envelopeOf(response)).error?.code).toBe('REPORT_NOT_FOUND')
  })

  it('`96` §14 — การเงินเรียก E1 ได้ 403 และ provider ไม่ถูกเรียกเลย', async () => {
    const provider = vi.fn(async () => data(1))
    REPORT_PROVIDERS['kpi-summary'] = provider
    requireSessionMock.mockResolvedValue(FINANCE)

    const response = await reportRoute(request('http://localhost/api/reports/kpi-summary'), params('kpi-summary'))
    expect(response.status).toBe(403)
    expect((await envelopeOf(response)).error?.code).toBe('PERMISSION_DENIED')
    expect(provider).not.toHaveBeenCalled()
  })

  it('ช่วง custom ที่กลับหัว = 400 REPORT_DATE_INVALID (`96` §12)', async () => {
    REPORT_PROVIDERS['gross-profit'] = async () => data(1)
    requireSessionMock.mockResolvedValue(FINANCE)

    const response = await reportRoute(
      request('http://localhost/api/reports/gross-profit?preset=custom&from=2026-08-31&to=2026-08-01'),
      params('gross-profit'),
    )
    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('REPORT_DATE_INVALID')
  })

  it('คืน payload พร้อมสถานะแคช และส่งพารามิเตอร์เฉพาะรายงานต่อให้ provider', async () => {
    const provider = vi.fn(async () => data(2))
    REPORT_PROVIDERS['gross-profit'] = provider
    requireSessionMock.mockResolvedValue(FINANCE)

    const envelope = await envelopeOf(
      await reportRoute(
        request('http://localhost/api/reports/gross-profit?preset=this_month&dimension=team'),
        params('gross-profit'),
      ),
    )
    const payload = envelope.data as { rows: unknown[]; cache: { mode: string }; report: { code: string } }

    expect(payload.report.code).toBe('F1')
    expect(payload.rows).toHaveLength(2)
    expect(payload.cache.mode).toBe('daily')
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ params: { dimension: 'team' } }))
  })
})

describe('POST /api/reports/:id/refresh', () => {
  it('ครั้งแรกล้างแคชได้ · กดซ้ำทันทีติด cooldown 5 นาที (E14)', async () => {
    REPORT_PROVIDERS['gross-profit'] = async () => data(1)
    requireSessionMock.mockResolvedValue(FINANCE)

    await reportRoute(request('http://localhost/api/reports/gross-profit'), params('gross-profit'))

    const first = await envelopeOf(
      await refreshRoute(request('http://localhost/api/reports/gross-profit/refresh', 'POST'), params('gross-profit')),
    )
    expect(first.data).toMatchObject({ allowed: true, invalidated: 1 })

    const second = await envelopeOf(
      await refreshRoute(request('http://localhost/api/reports/gross-profit/refresh', 'POST'), params('gross-profit')),
    )
    expect(second.data).toMatchObject({ allowed: false, invalidated: 0 })
  })

  it('ไม่มีสิทธิ์ดูรายงาน = 403 (รีเฟรชไม่ใช่ทางลัด)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    const response = await refreshRoute(
      request('http://localhost/api/reports/kpi-summary/refresh', 'POST'),
      params('kpi-summary'),
    )
    expect(response.status).toBe(403)
  })
})

describe('POST /api/reports/:id/export (E13)', () => {
  it('≤ 5,000 แถว ส่งไฟล์ Excel กลับทันที พร้อมชื่อไฟล์ พ.ศ.', async () => {
    REPORT_PROVIDERS['gross-profit'] = async () => data(3)
    requireSessionMock.mockResolvedValue(FINANCE)

    const response = await exportRoute(
      request('http://localhost/api/reports/gross-profit/export', 'POST', { format: 'xlsx', preset: 'this_month' }),
      params('gross-profit'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('content-disposition')).toContain('F1')
    expect(enqueueJobMock).not.toHaveBeenCalled()
  })

  it('เกิน 5,000 แถว = 202 + jobId (ไม่ส่งไฟล์) และงานถูกตั้งคิวพร้อมขอบเขตที่คำนวณแล้ว', async () => {
    REPORT_PROVIDERS['gross-profit'] = async () => data(5001)
    requireSessionMock.mockResolvedValue(FINANCE)
    enqueueJobMock.mockResolvedValue({ job: { id: 'job-1' }, duplicate: false })

    const response = await exportRoute(
      request('http://localhost/api/reports/gross-profit/export', 'POST', { format: 'xlsx', preset: 'this_month' }),
      params('gross-profit'),
    )

    expect(response.status).toBe(202)
    expect((await envelopeOf(response)).data).toMatchObject({ mode: 'job', jobId: 'job-1', rowCount: 5001 })

    const enqueued = enqueueJobMock.mock.calls[0]?.[0]
    expect(enqueued.jobType).toBe('report_export')
    expect(enqueued.createdBy).toBe(FINANCE.id)
    expect(enqueued.payload).toMatchObject({ reportId: 'gross-profit', format: 'xlsx', preset: 'this_month' })
    expect(typeof enqueued.payload.from).toBe('string')
    expect(typeof enqueued.payload.to).toBe('string')
  })

  it('รูปแบบไฟล์ที่ไม่รองรับ = 400 · ไม่มีสิทธิ์ = 403', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    REPORT_PROVIDERS['gross-profit'] = async () => data(1)

    const badFormat = await exportRoute(
      request('http://localhost/api/reports/gross-profit/export', 'POST', { format: 'docx' }),
      params('gross-profit'),
    )
    expect(badFormat.status).toBe(400)

    const denied = await exportRoute(
      request('http://localhost/api/reports/kpi-summary/export', 'POST', { format: 'xlsx' }),
      params('kpi-summary'),
    )
    expect(denied.status).toBe(403)
  })
})

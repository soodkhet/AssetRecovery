import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของ WHT Data (ไฟล์ 33 §12/§14 · `27` §6.12)
 *
 * ตรวจสิ่งที่ pure module ตรวจแทนไม่ได้: capability ที่ผูกกับ endpoint (DEC-002 — **การเงินดูได้
 * แต่ยกเลิกใบ/mark filed ไม่ได้**), `FILING_OVERDUE_WARNING` ต้องเดินทางมากับ envelope แบบ **200
 * ไม่ block**, และทะเบียนใบ 50 ทวิ **ไม่มีทางสร้างด้วยมือ** (เกิดจากรอบจ่าย `completed` เท่านั้น)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const whtQueriesMock = vi.hoisted(() => ({
  listWhtCertificates: vi.fn(),
  cancelWhtCertificate: vi.fn(),
  listWhtFilingSummaries: vi.fn(),
  markWhtFilingFiled: vi.fn(),
  getWhtCertificateDocSource: vi.fn(),
  syncWhtCertificatesFromPayout: vi.fn(),
}))
vi.mock('@/lib/wht/queries', () => whtQueriesMock)

const certificatesRoute = await import('@/app/api/accounting/wht-certificates/route')
const { PATCH: cancelCertificate } = await import('@/app/api/accounting/wht-certificates/[id]/cancel/route')
const filingRoute = await import('@/app/api/accounting/wht-filing-summary/route')
const { PATCH: markFiled } = await import('@/app/api/accounting/wht-filing-summary/[id]/mark-filed/route')

const CERT_ID = '00000000-0000-4000-8000-000000004501'
const SUMMARY_ID = '00000000-0000-4000-8000-000000004502'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'accounting@example.com',
    fullName: 'บัญชี ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const ACCOUNTANT = sessionUser({ manage_wht: 'manage' })
/** การเงิน = ดูทะเบียน WHT ได้ แต่ยกเลิกใบ/mark filed ไม่ได้ (`25` §7.5) */
const FINANCE = sessionUser({ manage_wht: 'view' })
const FIELD_AGENT = sessionUser({ perform_field_work: 'manage' })

function request(url: string, init?: RequestInit): NextRequest {
  const base = new Request(url, init) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonRequest(url: string, method: 'PATCH', body: unknown): NextRequest {
  return request(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
}

interface Envelope {
  success: boolean
  warning?: { code: string } | null
  error: { code: string } | null
}

async function envelopeOf(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope
}

const EMPTY_CERTS = {
  items: [],
  summary: { pnd3Satang: 0, pnd53Satang: 0, activeCount: 0, cancelledCount: 0, grossSatang: 0 },
}

const EMPTY_FILINGS = { items: [], pending: null, warning: null }

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const fn of Object.values(whtQueriesMock)) fn.mockReset()
})

describe('สิทธิ์ของโมดูล WHT (DEC-002 · `33` §12 · `25` §7.5)', () => {
  it('ไม่มี capability ของบัญชีเลย = 403 ทุก endpoint', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const responses = await Promise.all([
      certificatesRoute.GET(request('http://localhost/api/accounting/wht-certificates'), undefined),
      filingRoute.GET(request('http://localhost/api/accounting/wht-filing-summary'), undefined),
      cancelCertificate(
        jsonRequest(`http://localhost/api/accounting/wht-certificates/${CERT_ID}/cancel`, 'PATCH', {
          reason: 'ทดสอบ',
        }),
        params(CERT_ID),
      ),
      markFiled(
        jsonRequest(`http://localhost/api/accounting/wht-filing-summary/${SUMMARY_ID}/mark-filed`, 'PATCH', {
          reason: 'ทดสอบ',
        }),
        params(SUMMARY_ID),
      ),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(whtQueriesMock.listWhtCertificates).not.toHaveBeenCalled()
    expect(whtQueriesMock.cancelWhtCertificate).not.toHaveBeenCalled()
    expect(whtQueriesMock.markWhtFilingFiled).not.toHaveBeenCalled()
  })

  it('การเงินดูทะเบียน/สรุปรอบได้ (view) แต่ยกเลิกใบและ mark filed ไม่ได้ (403)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    whtQueriesMock.listWhtCertificates.mockResolvedValue(EMPTY_CERTS)
    whtQueriesMock.listWhtFilingSummaries.mockResolvedValue(EMPTY_FILINGS)

    const certs = await certificatesRoute.GET(request('http://localhost/api/accounting/wht-certificates'), undefined)
    const filings = await filingRoute.GET(request('http://localhost/api/accounting/wht-filing-summary'), undefined)
    expect(certs.status).toBe(200)
    expect(filings.status).toBe(200)

    const cancelled = await cancelCertificate(
      jsonRequest(`http://localhost/api/accounting/wht-certificates/${CERT_ID}/cancel`, 'PATCH', {
        reason: 'ฐานหักผิด',
      }),
      params(CERT_ID),
    )
    const filed = await markFiled(
      jsonRequest(`http://localhost/api/accounting/wht-filing-summary/${SUMMARY_ID}/mark-filed`, 'PATCH', {
        reason: 'ยื่นแล้ว',
      }),
      params(SUMMARY_ID),
    )

    expect(cancelled.status).toBe(403)
    expect(filed.status).toBe(403)
    expect(whtQueriesMock.cancelWhtCertificate).not.toHaveBeenCalled()
    expect(whtQueriesMock.markWhtFilingFiled).not.toHaveBeenCalled()
  })
})

describe('ยกเลิกหนังสือรับรอง (`33` §14)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(ACCOUNTANT))

  it('ไม่ระบุเหตุผล ⇒ 400 REQUIRED_MISSING และไม่แตะ DB', async () => {
    const response = await cancelCertificate(
      jsonRequest(`http://localhost/api/accounting/wht-certificates/${CERT_ID}/cancel`, 'PATCH', { reason: '  ' }),
      params(CERT_ID),
    )

    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('REQUIRED_MISSING')
    expect(whtQueriesMock.cancelWhtCertificate).not.toHaveBeenCalled()
  })

  it('body ถูกต้อง ⇒ ส่งต่อให้ service พร้อม id และค่า reissue ที่ default เป็น false', async () => {
    whtQueriesMock.cancelWhtCertificate.mockResolvedValue({ cancelled: { id: CERT_ID }, replacement: null })

    const response = await cancelCertificate(
      jsonRequest(`http://localhost/api/accounting/wht-certificates/${CERT_ID}/cancel`, 'PATCH', {
        reason: 'ฐานหักผิด',
      }),
      params(CERT_ID),
    )

    expect(response.status).toBe(200)
    expect(whtQueriesMock.cancelWhtCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACCOUNTANT }),
      CERT_ID,
      { reason: 'ฐานหักผิด', reissue: false },
    )
  })
})

describe('สรุปรอบนำส่ง (`33` §11/§14)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(ACCOUNTANT))

  it('เลยกำหนดนำส่ง ⇒ ยัง 200 พร้อม FILING_OVERDUE_WARNING ใน envelope (เตือน ไม่ block)', async () => {
    whtQueriesMock.listWhtFilingSummaries.mockResolvedValue({
      items: [{ id: SUMMARY_ID, isOverdue: true }],
      pending: { id: SUMMARY_ID, isOverdue: true },
      warning: { code: 'FILING_OVERDUE_WARNING', title: 'เลยกำหนด', message: 'ยื่นด่วน' },
    })

    const response = await filingRoute.GET(
      request('http://localhost/api/accounting/wht-filing-summary'),
      undefined,
    )

    expect(response.status).toBe(200)
    expect((await envelopeOf(response)).warning?.code).toBe('FILING_OVERDUE_WARNING')
  })

  it('mark filed ต้องมีอ้างอิงการยื่น ⇒ ว่าง = 400 · ครบ = ส่งต่อให้ service', async () => {
    const empty = await markFiled(
      jsonRequest(`http://localhost/api/accounting/wht-filing-summary/${SUMMARY_ID}/mark-filed`, 'PATCH', {
        reason: '',
      }),
      params(SUMMARY_ID),
    )
    expect((await envelopeOf(empty)).error?.code).toBe('REQUIRED_MISSING')
    expect(whtQueriesMock.markWhtFilingFiled).not.toHaveBeenCalled()

    whtQueriesMock.markWhtFilingFiled.mockResolvedValue({ id: SUMMARY_ID, status: 'filed' })
    const response = await markFiled(
      jsonRequest(`http://localhost/api/accounting/wht-filing-summary/${SUMMARY_ID}/mark-filed`, 'PATCH', {
        reason: 'ยื่นผ่าน e-Filing 2569-0001',
      }),
      params(SUMMARY_ID),
    )

    expect(response.status).toBe(200)
    expect(whtQueriesMock.markWhtFilingFiled).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACCOUNTANT }),
      SUMMARY_ID,
      { reason: 'ยื่นผ่าน e-Filing 2569-0001' },
    )
  })
})

describe('ทางเข้าที่ห้ามมี (`33` §9 · `27` §6.12)', () => {
  it('ทะเบียนใบ 50 ทวิ และสรุปรอบนำส่งมีแต่ GET — สร้าง/ลบด้วยมือไม่ได้', () => {
    expect(Object.keys(certificatesRoute).sort()).toEqual(['GET'])
    expect(Object.keys(filingRoute).sort()).toEqual(['GET'])
  })
})

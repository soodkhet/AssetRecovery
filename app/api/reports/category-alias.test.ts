import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/** UAT BUG-115 — path ชื่อพ้องรายหมวด (`96` §9) ส่งต่อให้ `GET /api/reports/:reportId` ด้วย id จริง */

const getReport = vi.hoisted(() => vi.fn(async () => new Response('ok')))
vi.mock('@/app/api/reports/[reportId]/route', () => ({ GET: getReport }))

const { GET: financeAlias } = await import('@/app/api/reports/finance/[reportId]/route')

function request(path: string): NextRequest {
  return new Request(`http://localhost${path}`) as unknown as NextRequest
}

beforeEach(() => {
  getReport.mockClear()
})

describe('GET /api/reports/finance/:name', () => {
  it('advance-overdue ⇒ ส่งต่อเป็นรายงาน F5 (id advance-overdue)', async () => {
    await financeAlias(request('/api/reports/finance/advance-overdue'), {
      params: Promise.resolve({ reportId: 'advance-overdue' }),
    })
    expect(getReport).toHaveBeenCalledTimes(1)
    const context = (getReport.mock.calls[0] as unknown as [unknown, { params: Promise<{ reportId: string }> }])[1]
    expect(await context.params).toEqual({ reportId: 'advance-overdue' })
  })

  it('ชื่อไม่มีจริง / รายงานคนละหมวด ⇒ 404 REPORT_NOT_FOUND ไม่ส่งต่อ', async () => {
    for (const slug of ['no-such-report', 'kpi-summary']) {
      const response = await financeAlias(request(`/api/reports/finance/${slug}`), {
        params: Promise.resolve({ reportId: slug }),
      })
      expect(response.status).toBe(404)
      const body = (await response.json()) as { error: { code: string } | null }
      expect(body.error?.code).toBe('REPORT_NOT_FOUND')
    }
    expect(getReport).not.toHaveBeenCalled()
  })
})

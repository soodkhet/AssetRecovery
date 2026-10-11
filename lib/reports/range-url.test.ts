import { describe, expect, it } from 'vitest'
import { reportRangeFromParams, reportRangeUrlUpdates, sameReportRange } from '@/lib/reports/range-url'

describe('reportRangeFromParams (mytester J-03)', () => {
  it('ไม่มี preset = ค่าเริ่มต้นของหน้า', () => {
    expect(reportRangeFromParams(new URLSearchParams(''), 'this_month')).toEqual({
      preset: 'this_month',
      from: '',
      to: '',
    })
    expect(reportRangeFromParams(new URLSearchParams(''), 'this_year')).toEqual({
      preset: 'this_year',
      from: '',
      to: '',
    })
  })

  it('อ่าน preset ที่รู้จัก · ไม่รู้จัก = ค่าเริ่มต้น', () => {
    expect(reportRangeFromParams(new URLSearchParams('preset=last_month'), 'this_month').preset).toBe('last_month')
    expect(reportRangeFromParams(new URLSearchParams('preset=yesterday'), 'this_month').preset).toBe('this_month')
  })

  it('from/to ใช้เฉพาะ custom และต้องเป็น YYYY-MM-DD', () => {
    expect(reportRangeFromParams(new URLSearchParams('preset=last_month&from=2026-01-01'), 'this_month')).toEqual({
      preset: 'last_month',
      from: '',
      to: '',
    })
    expect(
      reportRangeFromParams(new URLSearchParams('preset=custom&from=2026-09-01&to=2026-09-30'), 'this_month'),
    ).toEqual({ preset: 'custom', from: '2026-09-01', to: '2026-09-30' })
    expect(reportRangeFromParams(new URLSearchParams('preset=custom&from=01/09/2569&to=x'), 'this_month')).toEqual({
      preset: 'custom',
      from: '',
      to: '',
    })
  })
})

describe('reportRangeUrlUpdates', () => {
  it('ค่าเริ่มต้นไม่ลง URL', () => {
    expect(reportRangeUrlUpdates({ preset: 'this_month', from: '', to: '' }, 'this_month')).toEqual({
      preset: null,
      from: null,
      to: null,
    })
  })

  it('preset อื่นลง URL · ล้าง from/to ที่ค้างจาก custom', () => {
    expect(reportRangeUrlUpdates({ preset: 'last_month', from: '2026-01-01', to: '' }, 'this_month')).toEqual({
      preset: 'last_month',
      from: null,
      to: null,
    })
  })

  it('custom เขียนวันที่ที่กรอกแล้ว — ไปกลับได้ค่าเดิม', () => {
    const range = { preset: 'custom' as const, from: '2026-09-01', to: '' }
    const updates = reportRangeUrlUpdates(range, 'this_year')
    expect(updates).toEqual({ preset: 'custom', from: '2026-09-01', to: null })
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(updates)) if (value !== null) query.set(key, value)
    expect(sameReportRange(reportRangeFromParams(query, 'this_year'), range)).toBe(true)
  })
})

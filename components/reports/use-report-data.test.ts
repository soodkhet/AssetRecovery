import { describe, expect, it } from 'vitest'
import { reportDataUrl } from '@/components/reports/use-report-data'

/** mytester6 T-027 — "กำหนดเอง" ที่ยังเลือกวันไม่ครบ ไม่ยิงคำขอรายงาน (เดิมได้ 400 ทุกครั้ง) */
describe('reportDataUrl()', () => {
  it('กำหนดเองยังไม่ครบ/กลับหัว ⇒ null (ไม่ยิง)', () => {
    expect(reportDataUrl('team-scorecard', { preset: 'custom', from: '', to: '' })).toBeNull()
    expect(reportDataUrl('team-scorecard', { preset: 'custom', from: '2026-10-01', to: '' })).toBeNull()
    expect(reportDataUrl('team-scorecard', { preset: 'custom', from: '', to: '2026-10-31' })).toBeNull()
    expect(reportDataUrl('team-scorecard', { preset: 'custom', from: '2026-10-31', to: '2026-10-01' })).toBeNull()
  })

  it('ครบ ⇒ URL พร้อมช่วง + พารามิเตอร์ + refresh · preset อื่นไม่ต้องมีวัน', () => {
    expect(reportDataUrl('team-scorecard', { preset: 'custom', from: '2026-10-01', to: '2026-10-31' })).toBe(
      '/api/reports/team-scorecard?preset=custom&from=2026-10-01&to=2026-10-31',
    )
    expect(reportDataUrl('gp', { preset: 'this_month', from: '', to: '' }, { team: 't1' }, true)).toBe(
      '/api/reports/gp?preset=this_month&team=t1&refresh=true',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { ReportError } from '@/lib/reports/errors'
import { toIsoDateOnly } from '@/lib/reports/period'
import {
  REPORT_RANGE_PRESETS,
  previousReportRange,
  reportRangeKey,
  resolveReportRange,
} from '@/lib/reports/range'

/** 15/08/2026 03:00Z = 10:00 ตามเวลาไทย (อยู่ในวันไทยเดียวกัน) */
const NOW = new Date('2026-08-15T03:00:00Z')
/** 15/08/2026 20:00Z = 16/08 03:00 ไทย — ใช้พิสูจน์ว่าคิดด้วยวันไทยไม่ใช่ UTC */
const LATE = new Date('2026-08-31T18:00:00Z')

const iso = (date: Date): string => toIsoDateOnly(date)

describe('resolveReportRange — preset ของ `96` §11', () => {
  it('เดือนนี้ = ทั้งเดือนตามปฏิทินไทย + ป้าย พ.ศ.', () => {
    const range = resolveReportRange({ preset: 'this_month' }, NOW)
    expect(iso(range.startDate)).toBe('2026-08-01')
    expect(iso(range.endDate)).toBe('2026-08-31')
    expect(range.label).toBe('สิงหาคม 2569')
  })

  it('เดือนที่แล้วข้ามขอบเดือนถูกต้อง', () => {
    const range = resolveReportRange({ preset: 'last_month' }, NOW)
    expect(iso(range.startDate)).toBe('2026-07-01')
    expect(iso(range.endDate)).toBe('2026-07-31')
    expect(range.label).toBe('กรกฎาคม 2569')
  })

  it('ไตรมาสนี้ / ปีนี้', () => {
    expect(resolveReportRange({ preset: 'this_quarter' }, NOW).label).toBe('ไตรมาส 3/2569')
    expect(iso(resolveReportRange({ preset: 'this_quarter' }, NOW).startDate)).toBe('2026-07-01')
    expect(iso(resolveReportRange({ preset: 'this_quarter' }, NOW).endDate)).toBe('2026-09-30')
    expect(resolveReportRange({ preset: 'this_year' }, NOW).label).toBe('ปี 2569')
    expect(iso(resolveReportRange({ preset: 'this_year' }, NOW).endDate)).toBe('2026-12-31')
  })

  it('เวลาหลัง 17:00Z นับเป็นวันไทยถัดไป — สิ้นเดือน ส.ค. 18:00Z = ก.ย. แล้ว', () => {
    expect(resolveReportRange({ preset: 'this_month' }, LATE).label).toBe('กันยายน 2569')
    expect(resolveReportRange({ preset: 'last_month' }, LATE).label).toBe('สิงหาคม 2569')
  })

  it('custom รับ `YYYY-MM-DD` และ Date ที่ผ่าน Zod มาแล้ว · ป้ายเป็น พ.ศ.', () => {
    const fromString = resolveReportRange({ preset: 'custom', from: '2026-08-01', to: '2026-08-15' }, NOW)
    expect(fromString.label).toBe('01/08/2569 – 15/08/2569')

    const fromDate = resolveReportRange(
      { preset: 'custom', from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-15T00:00:00Z') },
      NOW,
    )
    expect(reportRangeKey(fromDate)).toBe(reportRangeKey(fromString))
  })

  it('custom ที่ไม่ครบ/ผิดรูป/กลับหัว ⇒ REPORT_DATE_INVALID (`96` §12)', () => {
    const cases: Array<{ from?: string; to?: string }> = [
      {},
      { from: '2026-08-01' },
      { from: '01/08/2026', to: '2026-08-15' },
      { from: '2026-02-31', to: '2026-03-01' },
      { from: '2026-08-15', to: '2026-08-01' },
    ]
    for (const input of cases) {
      expect(() => resolveReportRange({ preset: 'custom', ...input }, NOW), JSON.stringify(input)).toThrow(ReportError)
    }
    try {
      resolveReportRange({ preset: 'custom', from: '2026-08-15', to: '2026-08-01' }, NOW)
    } catch (error) {
      expect((error as ReportError).code).toBe('REPORT_DATE_INVALID')
      expect((error as ReportError).status).toBe(400)
    }
  })

  it('ทุก preset คืนช่วงที่ขอบล่างไม่เกินขอบบน', () => {
    for (const preset of REPORT_RANGE_PRESETS) {
      const range =
        preset === 'custom'
          ? resolveReportRange({ preset, from: '2026-01-01', to: '2026-01-31' }, NOW)
          : resolveReportRange({ preset }, NOW)
      expect(range.startDate.getTime(), preset).toBeLessThanOrEqual(range.endDate.getTime())
      expect(range.preset).toBe(preset)
    }
  })
})

describe('previousReportRange — ฐานของ MoM (`96` §11)', () => {
  it('เดือน/ไตรมาส/ปี ใช้ปฏิทินจริง', () => {
    const month = previousReportRange(resolveReportRange({ preset: 'this_month' }, NOW))
    expect(month.label).toBe('กรกฎาคม 2569')

    const quarter = previousReportRange(resolveReportRange({ preset: 'this_quarter' }, NOW))
    expect(quarter.label).toBe('ไตรมาส 2/2569')

    const year = previousReportRange(resolveReportRange({ preset: 'this_year' }, NOW))
    expect(year.label).toBe('ปี 2568')
  })

  it('เดือนที่แล้ว → เดือนก่อนหน้านั้นอีกที (ไม่วนกลับมาที่เดิม)', () => {
    const previous = previousReportRange(resolveReportRange({ preset: 'last_month' }, NOW))
    expect(previous.label).toBe('มิถุนายน 2569')
  })

  it('custom เลื่อนถอยหลังตามจำนวนวันเท่าเดิม (รวมวันสุดท้าย)', () => {
    const range = resolveReportRange({ preset: 'custom', from: '2026-08-08', to: '2026-08-14' }, NOW)
    const previous = previousReportRange(range)
    expect(iso(previous.startDate)).toBe('2026-08-01')
    expect(iso(previous.endDate)).toBe('2026-08-07')
  })
})

describe('reportRangeKey', () => {
  it('คีย์คงที่และแยกกันตาม preset + ขอบเขต', () => {
    const month = resolveReportRange({ preset: 'this_month' }, NOW)
    expect(reportRangeKey(month)).toBe('this_month:2026-08-01..2026-08-31')
    expect(reportRangeKey(previousReportRange(month))).not.toBe(reportRangeKey(month))
  })
})

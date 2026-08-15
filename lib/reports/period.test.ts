import { describe, expect, it } from 'vitest'
import { REPORT_PERIOD_TYPES, reportPeriodKey, resolveReportPeriod, toIsoDateOnly } from '@/lib/reports/period'

describe('resolveReportPeriod', () => {
  it('เดือน — ครอบทั้งเดือนตามปฏิทินไทย + ป้าย พ.ศ.', () => {
    const range = resolveReportPeriod('month', new Date('2026-08-15T10:00:00Z'))
    expect(toIsoDateOnly(range.startDate)).toBe('2026-08-01')
    expect(toIsoDateOnly(range.endDate)).toBe('2026-08-31')
    expect(range.label).toBe('สิงหาคม 2569')
  })

  it('เดือน — instant ก่อน 07:00 UTC ต้องนับเป็นวันไทย (ไม่ตกไปเดือนก่อน)', () => {
    // 31/07/2026 18:00Z = 01/08/2569 01:00 ตามเวลาไทย ⇒ ต้องได้เดือนสิงหาคม
    const range = resolveReportPeriod('month', new Date('2026-07-31T18:00:00Z'))
    expect(toIsoDateOnly(range.startDate)).toBe('2026-08-01')
    expect(range.label).toBe('สิงหาคม 2569')
  })

  it('เดือนกุมภาพันธ์ปีอธิกสุรทิน — วันสุดท้าย 29', () => {
    const range = resolveReportPeriod('month', new Date('2028-02-10T05:00:00Z'))
    expect(toIsoDateOnly(range.endDate)).toBe('2028-02-29')
  })

  it('ไตรมาส — เดือน 8 อยู่ไตรมาส 3 (ก.ค.–ก.ย.)', () => {
    const range = resolveReportPeriod('quarter', new Date('2026-08-15T10:00:00Z'))
    expect(toIsoDateOnly(range.startDate)).toBe('2026-07-01')
    expect(toIsoDateOnly(range.endDate)).toBe('2026-09-30')
    expect(range.label).toBe('ไตรมาส 3/2569')
  })

  it('ไตรมาส — เดือน 1 อยู่ไตรมาส 1', () => {
    const range = resolveReportPeriod('quarter', new Date('2026-01-05T10:00:00Z'))
    expect(toIsoDateOnly(range.startDate)).toBe('2026-01-01')
    expect(toIsoDateOnly(range.endDate)).toBe('2026-03-31')
    expect(range.label).toBe('ไตรมาส 1/2569')
  })

  it('ปี — ครอบทั้งปี + ป้าย พ.ศ.', () => {
    const range = resolveReportPeriod('year', new Date('2026-08-15T10:00:00Z'))
    expect(toIsoDateOnly(range.startDate)).toBe('2026-01-01')
    expect(toIsoDateOnly(range.endDate)).toBe('2026-12-31')
    expect(range.label).toBe('ปี 2569')
  })

  it('ป้ายไม่มีปี ค.ศ. โผล่ทุกชนิดช่วงเวลา (Rule 01)', () => {
    for (const type of REPORT_PERIOD_TYPES) {
      const range = resolveReportPeriod(type, new Date('2026-08-15T10:00:00Z'))
      expect(range.label).not.toContain('2026')
      expect(range.label).toContain('2569')
    }
  })

  it('วันอ้างอิงไม่ถูกต้อง ⇒ โยน', () => {
    expect(() => resolveReportPeriod('month', new Date('ไม่ใช่วันที่'))).toThrow(RangeError)
  })
})

describe('reportPeriodKey', () => {
  it('คีย์ต่างกันเมื่อช่วงเวลาต่างกัน และเท่ากันเมื่อช่วงเดียวกัน', () => {
    const august = resolveReportPeriod('month', new Date('2026-08-15T10:00:00Z'))
    const augustAgain = resolveReportPeriod('month', new Date('2026-08-28T02:00:00Z'))
    const quarter = resolveReportPeriod('quarter', new Date('2026-08-15T10:00:00Z'))

    expect(reportPeriodKey(august)).toBe(reportPeriodKey(augustAgain))
    expect(reportPeriodKey(august)).not.toBe(reportPeriodKey(quarter))
    expect(reportPeriodKey(august)).toBe('month:2026-08-01..2026-08-31')
  })
})

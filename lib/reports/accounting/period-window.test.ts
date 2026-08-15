import { describe, expect, it } from 'vitest'
import {
  accountingPeriodWindow,
  comparePeriodKeys,
  periodInWindow,
} from '@/lib/reports/accounting/period-window'
import { resolveReportRange } from '@/lib/reports/range'

/** ช่วงงวดบัญชีของรายงานหมวด A — งวดที่พาดผ่านแม้บางส่วนต้องอยู่ในช่วง */

const NOW = new Date('2026-08-15T05:00:00Z')

describe('accountingPeriodWindow', () => {
  it('เดือนนี้ ⇒ งวดเดียว (สิงหาคม 2569)', () => {
    const window = accountingPeriodWindow(resolveReportRange({ preset: 'this_month' }, NOW))
    expect(window).toEqual({ start: { yearBe: 2569, month: 8 }, end: { yearBe: 2569, month: 8 } })
  })

  it('ปีนี้ ⇒ มกราคม–ธันวาคม 2569', () => {
    const window = accountingPeriodWindow(resolveReportRange({ preset: 'this_year' }, NOW))
    expect(window).toEqual({ start: { yearBe: 2569, month: 1 }, end: { yearBe: 2569, month: 12 } })
  })

  it('ช่วงกำหนดเองที่คร่อมสองเดือน ⇒ ได้ทั้งสองงวด (ไม่ตัดงวดที่พาดบางส่วนทิ้ง)', () => {
    const window = accountingPeriodWindow(
      resolveReportRange({ preset: 'custom', from: '2026-06-15', to: '2026-07-20' }, NOW),
    )
    expect(window).toEqual({ start: { yearBe: 2569, month: 6 }, end: { yearBe: 2569, month: 7 } })
    expect(periodInWindow({ yearBe: 2569, month: 6 }, window)).toBe(true)
    expect(periodInWindow({ yearBe: 2569, month: 7 }, window)).toBe(true)
    expect(periodInWindow({ yearBe: 2569, month: 5 }, window)).toBe(false)
    expect(periodInWindow({ yearBe: 2569, month: 8 }, window)).toBe(false)
  })

  it('ช่วงข้ามปี ⇒ เทียบข้ามขอบปีถูกต้อง (ธันวาคมปีก่อนอยู่ในช่วง มกราคมปีก่อนไม่อยู่)', () => {
    const window = accountingPeriodWindow(
      resolveReportRange({ preset: 'custom', from: '2025-12-01', to: '2026-02-28' }, NOW),
    )
    expect(window).toEqual({ start: { yearBe: 2568, month: 12 }, end: { yearBe: 2569, month: 2 } })
    expect(periodInWindow({ yearBe: 2568, month: 12 }, window)).toBe(true)
    expect(periodInWindow({ yearBe: 2568, month: 1 }, window)).toBe(false)
    expect(periodInWindow({ yearBe: 2569, month: 3 }, window)).toBe(false)
  })
})

describe('comparePeriodKeys', () => {
  it('เรียงเก่า→ใหม่ ข้ามปีถูกต้อง', () => {
    const keys = [
      { yearBe: 2569, month: 1 },
      { yearBe: 2568, month: 12 },
      { yearBe: 2569, month: 2 },
    ]
    expect([...keys].sort(comparePeriodKeys)).toEqual([
      { yearBe: 2568, month: 12 },
      { yearBe: 2569, month: 1 },
      { yearBe: 2569, month: 2 },
    ])
  })
})

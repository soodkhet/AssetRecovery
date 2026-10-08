import { describe, expect, it } from 'vitest'
import {
  describeCutoffRule,
  describeDueRule,
  isCutoffShapeValid,
  isDueRuleShapeValid,
  normalizeCycleValues,
  resolveDueDate,
  closedPeriodChecker,
  suggestCutoffDate,
  suggestOpenCutoffDate,
  toCycleAuditPayload,
  type CycleValues,
} from '@/lib/settings/cycles'

/** `13` §6.1 — CHECK `cycles_cutoff_shape` / `cycles_due_rule_shape` (A5) */

const base: CycleValues = {
  name: ' AR รอบวางบิลหลัก ',
  type: 'AR',
  cutoffRuleType: 'fixed_dates',
  cutoffDates: [30, 15, 15],
  dueRuleType: 'net_days',
  dueRuleValue: 30,
  scopeKind: 'selected_companies',
  companyIds: ['c2', 'c1', 'c2'],
}

describe('normalizeCycleValues', () => {
  it('ตัดช่องว่าง + เรียงวันที่ + ตัดวันซ้ำ', () => {
    const values = normalizeCycleValues(base)
    expect(values.name).toBe('AR รอบวางบิลหลัก')
    expect(values.companyIds).toEqual(['c1', 'c2'])
    expect(values.cutoffDates).toEqual([15, 30])
  })

  it('ล้างค่าที่ไม่เข้าคู่กับชนิดจริง — ไม่ปล่อยให้ CHECK ระดับ DB จับทีหลัง', () => {
    const monthEnd = normalizeCycleValues({ ...base, cutoffRuleType: 'month_end' })
    expect(monthEnd.cutoffDates).toEqual([])
  })

  it('dueRuleType = month_end ล้าง dueRuleValue', () => {
    expect(normalizeCycleValues({ ...base, dueRuleType: 'month_end' }).dueRuleValue).toBeNull()
  })
})

describe('isCutoffShapeValid', () => {
  it('fixed_dates ต้องมีวันที่อย่างน้อย 1 วัน', () => {
    expect(isCutoffShapeValid({ cutoffRuleType: 'fixed_dates', cutoffDates: [15] })).toBe(true)
    expect(isCutoffShapeValid({ cutoffRuleType: 'fixed_dates', cutoffDates: [] })).toBe(false)
  })

  it('month_end ไม่ต้องมีค่าอะไรเพิ่ม', () => {
    expect(isCutoffShapeValid({ cutoffRuleType: 'month_end', cutoffDates: [] })).toBe(true)
  })
})

describe('isDueRuleShapeValid', () => {
  it('net_days ≥ 0 (มติ PO U146 — 0 = ครบกำหนดวันตัดรอบ) · day_of_next_month ต้องมากกว่า 0', () => {
    expect(isDueRuleShapeValid({ dueRuleType: 'net_days', dueRuleValue: 30 })).toBe(true)
    expect(isDueRuleShapeValid({ dueRuleType: 'net_days', dueRuleValue: 0 })).toBe(true)
    expect(isDueRuleShapeValid({ dueRuleType: 'net_days', dueRuleValue: -1 })).toBe(false)
    expect(isDueRuleShapeValid({ dueRuleType: 'net_days', dueRuleValue: null })).toBe(false)
    expect(isDueRuleShapeValid({ dueRuleType: 'day_of_next_month', dueRuleValue: 0 })).toBe(false)
    expect(isDueRuleShapeValid({ dueRuleType: 'day_of_next_month', dueRuleValue: null })).toBe(false)
  })

  it('month_end ไม่ต้องมีค่า', () => {
    expect(isDueRuleShapeValid({ dueRuleType: 'month_end', dueRuleValue: null })).toBe(true)
  })
})

describe('describeDueRule / describeCutoffRule', () => {
  it('label ภาษาไทยครบทั้ง 3 ชนิดของ due rule', () => {
    expect(describeDueRule({ dueRuleType: 'net_days', dueRuleValue: 30 })).toBe('Net 30 วัน')
    expect(describeDueRule({ dueRuleType: 'day_of_next_month', dueRuleValue: 5 })).toBe('วันที่ 5 ของเดือนถัดไป')
    expect(describeDueRule({ dueRuleType: 'month_end', dueRuleValue: null })).toBe('สิ้นเดือน')
  })

  it('label ของกติกาวันตัดรอบ', () => {
    expect(describeCutoffRule({ cutoffRuleType: 'fixed_dates', cutoffDates: [15, 30] })).toBe('ทุกวันที่ 15, 30')
    expect(describeCutoffRule({ cutoffRuleType: 'month_end', cutoffDates: [] })).toBe('ทุกสิ้นเดือน')
  })
})

describe('suggestCutoffDate (มติ PO U146 — รอบบิลเป็นที่เดียวที่กำหนดวันตัดรอบ)', () => {
  const d = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
  const iso = (date: Date): string => date.toISOString().slice(0, 10)

  it('fixed_dates: วันที่ล่าสุดที่ไม่เกินวันนี้ในเดือนนี้', () => {
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [5, 20] }, d('2026-10-07')))).toBe('2026-10-05')
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [5, 20] }, d('2026-10-20')))).toBe('2026-10-20')
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [5, 20] }, d('2026-10-25')))).toBe('2026-10-20')
  })

  it('fixed_dates: ยังไม่ถึงวันแรกของเดือน ⇒ ย้อนไปวันล่าสุดของเดือนก่อน (ข้ามปีได้)', () => {
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [5, 20] }, d('2026-10-03')))).toBe('2026-09-20')
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [25] }, d('2027-01-10')))).toBe('2026-12-25')
  })

  it('วันที่เกินจำนวนวันในเดือน (31) = วันสุดท้ายของเดือนนั้น', () => {
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [31] }, d('2026-03-10')))).toBe('2026-02-28')
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [15, 31] }, d('2026-09-30')))).toBe('2026-09-30')
  })

  it('month_end: วันนี้ถ้าเป็นสิ้นเดือน ไม่งั้นสิ้นเดือนก่อน', () => {
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'month_end', cutoffDates: [] }, d('2026-10-31')))).toBe('2026-10-31')
    expect(iso(suggestCutoffDate({ cutoffRuleType: 'month_end', cutoffDates: [] }, d('2026-10-07')))).toBe('2026-09-30')
  })

  it('รอบที่แปลงจากบริษัท (ตัดวันที่ 1 · Net 30) ให้วันครบกำหนดเท่าเดิม', () => {
    const cutoff = suggestCutoffDate({ cutoffRuleType: 'fixed_dates', cutoffDates: [1] }, d('2026-10-07'))
    expect(iso(cutoff)).toBe('2026-10-01')
    expect(iso(resolveDueDate(cutoff, { dueRuleType: 'net_days', dueRuleValue: 30 }))).toBe('2026-10-31')
  })
})

describe('toCycleAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case ตามตารางจริง + มี label due_rule', () => {
    const payload = toCycleAuditPayload(normalizeCycleValues(base))
    expect(payload).toMatchObject({
      cutoff_rule_type: 'fixed_dates',
      cutoff_dates: [15, 30],
      due_rule_type: 'net_days',
      due_rule_value: 30,
      due_rule: 'Net 30 วัน',
    })
  })
})

describe('resolveDueDate (A5 · `19` §7.2)', () => {
  const iso = (date: Date): string => date.toISOString().slice(0, 10)
  const cutoff = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

  it('net_days — บวกจำนวนวันจากวันตัดรอบ (ข้ามเดือน/ข้ามปีได้)', () => {
    expect(iso(resolveDueDate(cutoff('2026-08-31'), { dueRuleType: 'net_days', dueRuleValue: 30 }))).toBe('2026-09-30')
    expect(iso(resolveDueDate(cutoff('2026-12-20'), { dueRuleType: 'net_days', dueRuleValue: 30 }))).toBe('2027-01-19')
  })

  it('day_of_next_month — วันที่ N ของเดือนถัดไป', () => {
    expect(iso(resolveDueDate(cutoff('2026-08-31'), { dueRuleType: 'day_of_next_month', dueRuleValue: 5 }))).toBe(
      '2026-09-05',
    )
    expect(iso(resolveDueDate(cutoff('2026-12-15'), { dueRuleType: 'day_of_next_month', dueRuleValue: 10 }))).toBe(
      '2027-01-10',
    )
  })

  it('day_of_next_month — วันที่เกินจำนวนวันในเดือนถูก clamp เป็นวันสุดท้าย', () => {
    // ตัดรอบ ม.ค. → ครบกำหนด ก.พ. ซึ่งมี 28 วัน (2569 ไม่ใช่ปีอธิกสุรทิน)
    expect(iso(resolveDueDate(cutoff('2026-01-31'), { dueRuleType: 'day_of_next_month', dueRuleValue: 31 }))).toBe(
      '2026-02-28',
    )
    // ปีอธิกสุรทิน 2028 → 29 ก.พ.
    expect(iso(resolveDueDate(cutoff('2028-01-31'), { dueRuleType: 'day_of_next_month', dueRuleValue: 31 }))).toBe(
      '2028-02-29',
    )
  })

  it('month_end — วันสุดท้ายของเดือนที่ตัดรอบ (ไม่ใช้ due_rule_value)', () => {
    expect(iso(resolveDueDate(cutoff('2026-02-10'), { dueRuleType: 'month_end', dueRuleValue: null }))).toBe(
      '2026-02-28',
    )
    expect(iso(resolveDueDate(cutoff('2026-08-01'), { dueRuleType: 'month_end', dueRuleValue: null }))).toBe(
      '2026-08-31',
    )
  })

  it('ผลลัพธ์เป็น date-only (เที่ยงคืน UTC) เสมอ — ลงคอลัมน์ `DATE` ได้ตรง', () => {
    const due = resolveDueDate(cutoff('2026-08-31'), { dueRuleType: 'net_days', dueRuleValue: 30 })
    expect(due.getUTCHours()).toBe(0)
    expect(due.getUTCMinutes()).toBe(0)
  })
})

describe('suggestOpenCutoffDate — ไม่เสนอวันตัดรอบในงวดที่ปิดแล้ว (preship R7-009 · P11)', () => {
  const d = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
  const iso = (date: Date): string => date.toISOString().slice(0, 10)
  const SEPT_2569_CLOSED = closedPeriodChecker([{ yearBe: 2569, month: 9 }])
  const NONE_CLOSED = closedPeriodChecker([])

  it('closedPeriodChecker: เทียบ พ.ศ./เดือน ของวัน date-only', () => {
    expect(SEPT_2569_CLOSED(d('2026-09-30'))).toBe(true)
    expect(SEPT_2569_CLOSED(d('2026-09-01'))).toBe(true)
    expect(SEPT_2569_CLOSED(d('2026-10-01'))).toBe(false)
    expect(SEPT_2569_CLOSED(d('2025-09-30'))).toBe(false)
  })

  it('month_end: สิ้นเดือนก่อนอยู่ในงวดเปิด ⇒ ตามกติกาเดิม · งวดปิด ⇒ วันนี้', () => {
    const rule: Pick<CycleValues, 'cutoffRuleType' | 'cutoffDates'> = { cutoffRuleType: 'month_end', cutoffDates: [] }
    expect(iso(suggestOpenCutoffDate(rule, d('2026-10-08'), NONE_CLOSED))).toBe('2026-09-30')
    expect(iso(suggestOpenCutoffDate(rule, d('2026-10-08'), SEPT_2569_CLOSED))).toBe('2026-10-08')
    // วันนี้เป็นสิ้นเดือนเอง (งวดเปิด) ⇒ วันนี้ตามกติกา
    expect(iso(suggestOpenCutoffDate(rule, d('2026-10-31'), SEPT_2569_CLOSED))).toBe('2026-10-31')
  })

  it('fixed_dates: วันล่าสุดในเดือนนี้ใช้ได้ตามเดิม · ย้อนไปเดือนที่ปิด ⇒ วันนี้', () => {
    const rule: Pick<CycleValues, 'cutoffRuleType' | 'cutoffDates'> = { cutoffRuleType: 'fixed_dates', cutoffDates: [5, 20] }
    expect(iso(suggestOpenCutoffDate(rule, d('2026-10-07'), SEPT_2569_CLOSED))).toBe('2026-10-05')
    expect(iso(suggestOpenCutoffDate(rule, d('2026-10-03'), SEPT_2569_CLOSED))).toBe('2026-10-03')
    expect(iso(suggestOpenCutoffDate(rule, d('2026-10-03'), NONE_CLOSED))).toBe('2026-09-20')
  })
})

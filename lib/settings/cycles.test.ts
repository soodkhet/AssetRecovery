import { describe, expect, it } from 'vitest'
import {
  describeCutoffRule,
  describeDueRule,
  isCutoffShapeValid,
  isDueRuleShapeValid,
  normalizeCycleValues,
  resolveDueDate,
  toCycleAuditPayload,
  type CycleValues,
} from '@/lib/settings/cycles'

/** `13` §6.1 — CHECK `cycles_cutoff_shape` / `cycles_due_rule_shape` (A5) */

const base: CycleValues = {
  name: ' AR รอบวางบิลหลัก ',
  type: 'AR',
  cutoffRuleType: 'fixed_dates',
  cutoffDates: [30, 15, 15],
  cutoffText: 'ค่าค้างจากชนิดอื่น',
  dueRuleType: 'net_days',
  dueRuleValue: 30,
  scope: ' ทุกไฟแนนซ์ ',
}

describe('normalizeCycleValues', () => {
  it('ตัดช่องว่าง + เรียงวันที่ + ตัดวันซ้ำ', () => {
    const values = normalizeCycleValues(base)
    expect(values.name).toBe('AR รอบวางบิลหลัก')
    expect(values.scope).toBe('ทุกไฟแนนซ์')
    expect(values.cutoffDates).toEqual([15, 30])
  })

  it('ล้างค่าที่ไม่เข้าคู่กับชนิดจริง — ไม่ปล่อยให้ CHECK ระดับ DB จับทีหลัง', () => {
    expect(normalizeCycleValues(base).cutoffText).toBeNull()
    const monthEnd = normalizeCycleValues({ ...base, cutoffRuleType: 'month_end' })
    expect(monthEnd.cutoffDates).toEqual([])
    expect(monthEnd.cutoffText).toBeNull()
  })

  it('custom_text เก็บข้อความ แต่ล้างวันที่ทิ้ง', () => {
    const custom = normalizeCycleValues({ ...base, cutoffRuleType: 'custom_text', cutoffText: ' ทุกวันศุกร์สุดท้าย ' })
    expect(custom.cutoffText).toBe('ทุกวันศุกร์สุดท้าย')
    expect(custom.cutoffDates).toEqual([])
  })

  it('ข้อความว่างกลายเป็น null (ฟอร์มส่ง `` มาเสมอ)', () => {
    expect(normalizeCycleValues({ ...base, cutoffRuleType: 'custom_text', cutoffText: '   ' }).cutoffText).toBeNull()
  })

  it('dueRuleType = month_end ล้าง dueRuleValue', () => {
    expect(normalizeCycleValues({ ...base, dueRuleType: 'month_end' }).dueRuleValue).toBeNull()
  })
})

describe('isCutoffShapeValid', () => {
  it('fixed_dates ต้องมีวันที่อย่างน้อย 1 วัน', () => {
    expect(isCutoffShapeValid({ cutoffRuleType: 'fixed_dates', cutoffDates: [15], cutoffText: null })).toBe(true)
    expect(isCutoffShapeValid({ cutoffRuleType: 'fixed_dates', cutoffDates: [], cutoffText: null })).toBe(false)
  })

  it('custom_text ต้องมีข้อความ', () => {
    expect(isCutoffShapeValid({ cutoffRuleType: 'custom_text', cutoffDates: [], cutoffText: 'ทุกวันศุกร์' })).toBe(true)
    expect(isCutoffShapeValid({ cutoffRuleType: 'custom_text', cutoffDates: [], cutoffText: '  ' })).toBe(false)
    expect(isCutoffShapeValid({ cutoffRuleType: 'custom_text', cutoffDates: [], cutoffText: null })).toBe(false)
  })

  it('month_end ไม่ต้องมีค่าอะไรเพิ่ม', () => {
    expect(isCutoffShapeValid({ cutoffRuleType: 'month_end', cutoffDates: [], cutoffText: null })).toBe(true)
  })
})

describe('isDueRuleShapeValid', () => {
  it('net_days / day_of_next_month ต้องมีค่ามากกว่า 0', () => {
    expect(isDueRuleShapeValid({ dueRuleType: 'net_days', dueRuleValue: 30 })).toBe(true)
    expect(isDueRuleShapeValid({ dueRuleType: 'net_days', dueRuleValue: 0 })).toBe(false)
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
    expect(describeCutoffRule({ cutoffRuleType: 'fixed_dates', cutoffDates: [15, 30], cutoffText: null })).toBe('ทุกวันที่ 15, 30')
    expect(describeCutoffRule({ cutoffRuleType: 'month_end', cutoffDates: [], cutoffText: null })).toBe('ทุกสิ้นเดือน')
    expect(describeCutoffRule({ cutoffRuleType: 'custom_text', cutoffDates: [], cutoffText: 'ทุกวันศุกร์' })).toBe('ทุกวันศุกร์')
    expect(describeCutoffRule({ cutoffRuleType: 'custom_text', cutoffDates: [], cutoffText: null })).toBe('—')
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

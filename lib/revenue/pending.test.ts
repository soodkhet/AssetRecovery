import { describe, expect, it } from 'vitest'
import { REVENUE_TRIGGER_HINT, revenuePendingReasonOf, revenuePendingReasonText } from '@/lib/revenue/pending'

describe('เคสรอเกิดรายได้ (staging E-008)', () => {
  it('เหตุผลที่ผู้ใช้ตามแก้ได้แสดงในรายการ · มีรายได้แล้ว/ไม่คิดเงินเมื่อไม่สำเร็จ ไม่แสดง', () => {
    expect(revenuePendingReasonOf('field_days_not_settled')).toBe('field_days_not_settled')
    expect(revenuePendingReasonOf('expense_not_approved')).toBe('expense_not_approved')
    expect(revenuePendingReasonOf('warehouse_gate')).toBe('warehouse_gate')
    expect(revenuePendingReasonOf(null)).toBe('gates_passed')
    expect(revenuePendingReasonOf('already_created')).toBeNull()
    expect(revenuePendingReasonOf('model_excludes_fail')).toBeNull()
    expect(revenuePendingReasonOf('no_outcome')).toBeNull()
  })

  it('ข้อความเหตุผลเป็นภาษาไทย ไม่มีชื่อโค้ด', () => {
    expect(revenuePendingReasonText('field_days_not_settled')).toContain('วันลงพื้นที่')
    expect(revenuePendingReasonText('warehouse_gate')).toContain('คลัง')
    expect(revenuePendingReasonText('expense_not_approved')).not.toMatch(/[a-z_]{4,}/)
  })

  it('ข้อความบนหน้ารายได้บอกครบ 3 เงื่อนไข', () => {
    expect(REVENUE_TRIGGER_HINT).toContain('วันลงพื้นที่')
    expect(REVENUE_TRIGGER_HINT).toContain('รายการเบิก')
    expect(REVENUE_TRIGGER_HINT).toContain('คลัง')
  })
})

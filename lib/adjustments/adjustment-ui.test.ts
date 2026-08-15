import { describe, expect, it } from 'vitest'
import {
  ADJUSTMENT_STATUS_FILTERS,
  ADJUSTMENT_STATUS_LABEL,
  ADJUSTMENT_TARGET_FILTERS,
  ADJUSTMENT_TYPE_TONE,
  adjustmentSignPrefix,
  adjustmentStatusBadgeGroup,
  canActOnAdjustment,
  periodStatusBadgeGroup,
  periodStatusLabel,
} from '@/lib/adjustments/adjustment-ui'

/** ป้าย/ปุ่มของแท็บปรับปรุง (`20` §8) — ยามไม่ให้หน้าจอ if สถานะเอง */

describe('ป้ายกำกับครบทุกค่า enum', () => {
  it('สถานะ Adjustment 3 ค่า มีทั้งป้ายและกลุ่มสี', () => {
    for (const status of ['pending_approval', 'approved', 'rejected'] as const) {
      expect(ADJUSTMENT_STATUS_LABEL[status].length).toBeGreaterThan(0)
      expect(adjustmentStatusBadgeGroup(status)).toBeTruthy()
    }
  })

  it('สถานะรอบบัญชีใช้ข้อความจากนโยบาย `13` §6.11 · null = ยังไม่เปิดงวด', () => {
    expect(periodStatusLabel('locked')).toBe('ปิดรอบแล้ว')
    expect(periodStatusLabel('sent_to_accountant')).toBe('ส่งสำนักงานบัญชีแล้ว')
    expect(periodStatusLabel(null)).toBe('ยังไม่เปิดงวด')
    expect(periodStatusBadgeGroup('locked')).toBe('critical')
    expect(periodStatusBadgeGroup(null)).toBe('neutral')
  })

  it('ทิศทางยอด: เพิ่ม = + เขียว · ลด = − แดง (`20` §8)', () => {
    expect(adjustmentSignPrefix('increase')).toBe('+')
    expect(adjustmentSignPrefix('decrease')).toBe('−')
    expect(ADJUSTMENT_TYPE_TONE.increase).toContain('emerald')
    expect(ADJUSTMENT_TYPE_TONE.decrease).toContain('red')
  })

  it('ตัวกรองขึ้นต้นด้วย "ทั้งหมด" และค่าตรงกับ enum/ชนิดเป้าหมาย', () => {
    expect(ADJUSTMENT_STATUS_FILTERS[0]?.value).toBe('all')
    expect(ADJUSTMENT_STATUS_FILTERS.slice(1).map((item) => item.value)).toEqual([
      'pending_approval',
      'approved',
      'rejected',
    ])
    expect(ADJUSTMENT_TARGET_FILTERS.slice(1).map((item) => item.value)).toEqual([
      'revenue',
      'expense',
      'billing_batch',
      'payout_batch',
    ])
  })
})

describe('ปุ่มบนแถวตรงกับ state machine (`23` §6.9)', () => {
  it('ทำรายการได้เฉพาะที่ยังรออนุมัติ', () => {
    expect(canActOnAdjustment('pending_approval')).toBe(true)
    expect(canActOnAdjustment('approved')).toBe(false)
    expect(canActOnAdjustment('rejected')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { isSettingsError } from '@/lib/settings/errors'
import {
  PERIOD_LOCK_POLICY,
  assertPeriodEditable,
  isDirectEditBlocked,
  periodLockPolicyFor,
} from '@/lib/settings/period-lock'

/** `13` §6.11 · §15 "แก้ไขขณะ locked → reject PERIOD_LOCKED_DIRECT_EDIT" (โครง — บังคับเต็ม Phase 4.1) */

describe('PERIOD_LOCK_POLICY', () => {
  it('ครบ 3 สถานะตามตาราง `13` §6.11 เรียงตามลำดับวงจร', () => {
    expect(PERIOD_LOCK_POLICY.map((row) => row.status)).toEqual(['collecting', 'sent_to_accountant', 'locked'])
  })

  it('collecting = แก้อิสระ ไม่ต้อง Adjustment', () => {
    const row = periodLockPolicyFor('collecting')
    expect(row.directEdit).toBe('free')
    expect(row.adjustmentRequired).toBe('no')
  })

  it('sent_to_accountant = แก้ได้จำกัด + บางกรณีต้อง Adjustment + ปลดล็อกต้องมีบริหารร่วม', () => {
    const row = periodLockPolicyFor('sent_to_accountant')
    expect(row.directEdit).toBe('limited')
    expect(row.adjustmentRequired).toBe('sometimes')
    expect(row.unlockApprovers).toContain('บริหาร')
  })

  it('locked = แก้ตรงไม่ได้ + บังคับ Adjustment 100% + บริหารเท่านั้นปลดล็อก', () => {
    const row = periodLockPolicyFor('locked')
    expect(row.directEdit).toBe('blocked')
    expect(row.adjustmentRequired).toBe('always')
    expect([...row.unlockApprovers]).toEqual(['บริหาร'])
  })

  it('สถานะที่ไม่มีในนโยบาย = โยน error (กันสถานะใหม่หลุดเข้ามาเงียบๆ)', () => {
    // @ts-expect-error — ตั้งใจส่งค่านอก enum เพื่อทดสอบยาม
    expect(() => periodLockPolicyFor('archived')).toThrow()
  })
})

describe('isDirectEditBlocked', () => {
  it('เฉพาะ locked ที่บล็อกการแก้ตรง', () => {
    expect(isDirectEditBlocked('collecting')).toBe(false)
    expect(isDirectEditBlocked('sent_to_accountant')).toBe(false)
    expect(isDirectEditBlocked('locked')).toBe(true)
  })
})

describe('assertPeriodEditable', () => {
  it('ยังไม่มีงวดของเดือนนั้น (null) = แก้ได้', () => {
    expect(() => assertPeriodEditable({ periodStatus: null, targetType: 'expenses' })).not.toThrow()
  })

  it('collecting / sent_to_accountant = ผ่าน (ข้อจำกัดรายฟิลด์เป็นงานของ Phase 4.1)', () => {
    expect(() => assertPeriodEditable({ periodStatus: 'collecting', targetType: 'expenses' })).not.toThrow()
    expect(() => assertPeriodEditable({ periodStatus: 'sent_to_accountant', targetType: 'expenses' })).not.toThrow()
  })

  it('locked = PERIOD_LOCKED_DIRECT_EDIT พร้อมบอกเป้าหมาย', () => {
    try {
      assertPeriodEditable({ periodStatus: 'locked', targetType: 'expenses', targetId: 'e1' })
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(isSettingsError(error)).toBe(true)
      if (isSettingsError(error)) {
        expect(error.code).toBe('PERIOD_LOCKED_DIRECT_EDIT')
        expect(error.status).toBe(400)
        expect(error.context).toMatchObject({ targetType: 'expenses', periodStatus: 'locked' })
        expect(error.userMessage).toContain('Adjustment')
      }
    }
  })
})

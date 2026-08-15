import { describe, expect, it } from 'vitest'
import {
  ADJUSTMENT_TARGET_TYPES,
  adjustmentTargetColumns,
  adjustmentTargetOf,
  approvalCapabilityFor,
  approverRolesOf,
  APPROVE_ADJUSTMENT,
  APPROVE_ADJUSTMENT_LOCKED,
  assertActorCanApproveAdjustment,
  assertAdjustmentActionable,
  assertAdjustmentReason,
  assertRejectionReason,
  canTransitionAdjustment,
  netAfterAdjustments,
  parsePeriodStatusSnapshot,
  periodKeyOf,
  signedAdjustmentSatang,
  type AdjustmentTargetType,
} from '@/lib/adjustments/adjustment'
import { isAdjustmentError } from '@/lib/adjustments/errors'
import type { AdjustmentStatus, AdjustmentType } from '@/lib/generated/prisma/enums'

/**
 * กติกา pure ของไฟล์ 20 — เทสต์ตาม §16 (reason บังคับ / ปฏิเสธต้องมีเหตุผล / รอบ locked
 * ต้องผู้บริหาร) + DEC-004 (CHECK exactly-one) + `23` §6.9
 */

const FINANCE = {
  id: 'user-finance',
  isSuperadmin: false,
  capabilities: { [APPROVE_ADJUSTMENT]: 'manage' } as const,
}
const EXECUTIVE = {
  id: 'user-exec',
  isSuperadmin: false,
  capabilities: { [APPROVE_ADJUSTMENT]: 'manage', [APPROVE_ADJUSTMENT_LOCKED]: 'manage' } as const,
}
const SUPERADMIN = { id: 'user-root', isSuperadmin: true, capabilities: {} }

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return isAdjustmentError(error) ? error.code : `NOT_ADJUSTMENT_ERROR:${String(error)}`
  }
  return 'NO_ERROR'
}

describe('เป้าหมายแบบ Separate FK columns (DEC-004 — CHECK exactly-one)', () => {
  it.each(ADJUSTMENT_TARGET_TYPES)('ชนิด %s เติมค่าเพียงคอลัมน์เดียว', (targetType) => {
    const columns = adjustmentTargetColumns(targetType, 'target-1')
    const filled = Object.values(columns).filter((value) => value !== null)
    expect(filled).toEqual(['target-1'])
  })

  it('อ่านกลับได้ตรงชนิดเดิมทุกตัว', () => {
    for (const targetType of ADJUSTMENT_TARGET_TYPES) {
      expect(adjustmentTargetOf(adjustmentTargetColumns(targetType, 'target-9'))).toEqual({
        targetType,
        targetId: 'target-9',
      })
    }
  })

  it('ไม่มีเป้าหมายเลย หรือมีมากกว่า 1 = ข้อมูลผิดรูป (ต้องล้ม ไม่ใช่เดา)', () => {
    expect(() =>
      adjustmentTargetOf({ revenueId: null, expenseId: null, billingBatchId: null, payoutBatchId: null }),
    ).toThrow(RangeError)
    expect(() =>
      adjustmentTargetOf({ revenueId: 'r1', expenseId: 'e1', billingBatchId: null, payoutBatchId: null }),
    ).toThrow(RangeError)
  })
})

describe('ยอดปรับ (`20` §7.1 — บวกเสมอ ทิศทางอยู่ที่ประเภท)', () => {
  it('increase = +amount · decrease = −amount', () => {
    expect(signedAdjustmentSatang('increase', 75_000)).toBe(75_000)
    expect(signedAdjustmentSatang('decrease', 75_000)).toBe(-75_000)
  })

  it('ยอด 0 / ติดลบ / ทศนิยม ถูกปฏิเสธ (ยามเงินสตางค์)', () => {
    expect(() => signedAdjustmentSatang('increase', 0)).toThrow(RangeError)
    expect(() => signedAdjustmentSatang('decrease', -1)).toThrow(RangeError)
    expect(() => signedAdjustmentSatang('increase', 10.5)).toThrow(RangeError)
  })

  it('ยอดสุทธิ (`20` §9) นับเฉพาะรายการที่อนุมัติแล้ว', () => {
    const rows: { adjustmentType: AdjustmentType; amountSatang: number; status: AdjustmentStatus }[] = [
      { adjustmentType: 'increase', amountSatang: 50_000, status: 'approved' },
      { adjustmentType: 'decrease', amountSatang: 20_000, status: 'approved' },
      { adjustmentType: 'decrease', amountSatang: 90_000, status: 'pending_approval' },
      { adjustmentType: 'increase', amountSatang: 99_000, status: 'rejected' },
    ]
    expect(netAfterAdjustments(1_000_000, rows)).toBe(1_030_000)
  })
})

describe('state machine (`23` §6.9)', () => {
  it('pending_approval ไปได้ทั้ง approved และ rejected', () => {
    expect(canTransitionAdjustment('pending_approval', 'approved')).toBe(true)
    expect(canTransitionAdjustment('pending_approval', 'rejected')).toBe(true)
  })

  it('approved/rejected เป็น terminal', () => {
    expect(canTransitionAdjustment('approved', 'rejected')).toBe(false)
    expect(canTransitionAdjustment('rejected', 'approved')).toBe(false)
  })

  it('ทำ action ซ้ำได้ `ADJUSTMENT_INVALID_STATUS`', () => {
    expect(codeOf(() => assertAdjustmentActionable('approved', 'approved'))).toBe('ADJUSTMENT_INVALID_STATUS')
    expect(codeOf(() => assertAdjustmentActionable('pending_approval', 'approved'))).toBe('NO_ERROR')
  })
})

describe('validation (`20` §11 · §16)', () => {
  it('ไม่กรอกเหตุผล = `REASON_REQUIRED`', () => {
    expect(codeOf(() => assertAdjustmentReason(''))).toBe('REASON_REQUIRED')
    expect(codeOf(() => assertAdjustmentReason('   '))).toBe('REASON_REQUIRED')
    expect(codeOf(() => assertAdjustmentReason('สั้น'))).toBe('REASON_REQUIRED')
    expect(assertAdjustmentReason('  ยอดเดิมคำนวณผิด  ')).toBe('ยอดเดิมคำนวณผิด')
  })

  it('ปฏิเสธโดยไม่กรอกเหตุผล = `REJECTION_REASON_REQUIRED`', () => {
    expect(codeOf(() => assertRejectionReason(''))).toBe('REJECTION_REASON_REQUIRED')
    expect(assertRejectionReason('เอกสารประกอบไม่ครบ')).toBe('เอกสารประกอบไม่ครบ')
  })
})

describe('ระดับสิทธิ์ผู้อนุมัติ (`20` §6.2 · `25` §7.4 · §16)', () => {
  it('รอบ locked ใช้ capability คนละตัวกับรอบอื่น', () => {
    expect(approvalCapabilityFor('locked')).toBe(APPROVE_ADJUSTMENT_LOCKED)
    expect(approvalCapabilityFor('sent_to_accountant')).toBe(APPROVE_ADJUSTMENT)
    expect(approvalCapabilityFor('collecting')).toBe(APPROVE_ADJUSTMENT)
    expect(approvalCapabilityFor(null)).toBe(APPROVE_ADJUSTMENT)
  })

  it('การเงินอนุมัติรายการของรอบ locked ไม่ได้ ⇒ `INSUFFICIENT_APPROVAL_LEVEL` (§16 เคสที่ 1)', () => {
    let code = 'NO_ERROR'
    try {
      assertActorCanApproveAdjustment(FINANCE, 'locked')
    } catch (error) {
      code = (error as { code?: string }).code ?? 'UNKNOWN'
    }
    expect(code).toBe('INSUFFICIENT_APPROVAL_LEVEL')
    expect(() => assertActorCanApproveAdjustment(FINANCE, 'collecting')).not.toThrow()
    expect(() => assertActorCanApproveAdjustment(EXECUTIVE, 'locked')).not.toThrow()
  })

  it('Superadmin ผ่านทุกระดับ และนับครบทุกบทบาทที่ระดับนั้นต้องใช้ (DEC-009)', () => {
    expect(() => assertActorCanApproveAdjustment(SUPERADMIN, 'locked')).not.toThrow()
    expect(approverRolesOf({ roleName: 'Superadmin', isSuperadmin: true }, 'sent_to_accountant')).toEqual([
      'การเงิน',
      'บริหาร',
    ])
    expect(approverRolesOf({ roleName: 'การเงิน', isSuperadmin: false }, 'sent_to_accountant')).toEqual(['การเงิน'])
  })
})

describe('งวดบัญชีของรายการต้นทาง', () => {
  it('งวดยึดปฏิทินไทย + ปี พ.ศ.', () => {
    // 31/12/2026 17:30 UTC = 1 ม.ค. 2027 เวลาไทย ⇒ งวด 1/2570
    expect(periodKeyOf(new Date('2026-12-31T17:30:00Z'))).toEqual({ yearBe: 2570, month: 1 })
    // คอลัมน์ `DATE` เก็บเป็นเที่ยงคืน UTC — ต้องได้เดือนเดิม ไม่เลื่อน
    expect(periodKeyOf(new Date('2026-06-01T00:00:00Z'))).toEqual({ yearBe: 2569, month: 6 })
  })

  it('snapshot ที่อ่านไม่ออก/ว่าง ถือเป็น null (= collecting ตาม `13` §6.11)', () => {
    expect(parsePeriodStatusSnapshot('locked')).toBe('locked')
    expect(parsePeriodStatusSnapshot('sent_to_accountant')).toBe('sent_to_accountant')
    expect(parsePeriodStatusSnapshot(null)).toBeNull()
    expect(parsePeriodStatusSnapshot('ปิดรอบแล้ว')).toBeNull()
  })
})

describe('ทะเบียนชนิดเป้าหมายครบตาม `20` §7.1', () => {
  it('มี 4 ชนิดตรงกับ FK 4 คอลัมน์', () => {
    const expected: AdjustmentTargetType[] = ['revenue', 'expense', 'billing_batch', 'payout_batch']
    expect([...ADJUSTMENT_TARGET_TYPES]).toEqual(expected)
  })
})

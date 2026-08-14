import { describe, expect, it } from 'vitest'
import {
  adjustmentApprovalPolicyFor,
  assertApprovalLevelSufficient,
  EXECUTIVE_ROLE,
  FINANCE_ROLE,
  missingApproverRoles,
  requiresSeparateAuditEntry,
} from '@/lib/finance/adjustment-approval-policy'
import { isFinanceError } from '@/lib/finance/errors'
import { PERIOD_LOCK_POLICY } from '@/lib/settings/period-lock'

/** `20` §6.2 + §16 · `13` §6.11 — ระดับผู้อนุมัติ Adjustment ตามสถานะรอบบัญชีของรายการต้นทาง */

describe('ตาราง `20` §6.2', () => {
  it('collecting → การเงินอนุมัติได้เอง', () => {
    const policy = adjustmentApprovalPolicyFor('collecting')
    expect(policy.requiredRoles).toEqual([FINANCE_ROLE])
    expect(policy.selfApprovalAllowed).toBe(true)
    expect(policy.separateAuditEntry).toBe(false)
  })

  it('sent_to_accountant → ต้องมีทั้งการเงินและบริหาร', () => {
    const policy = adjustmentApprovalPolicyFor('sent_to_accountant')
    expect(policy.requiredRoles).toEqual([FINANCE_ROLE, EXECUTIVE_ROLE])
    expect(policy.selfApprovalAllowed).toBe(false)
  })

  it('locked → บริหารเท่านั้น + audit แยกชัดเจน', () => {
    const policy = adjustmentApprovalPolicyFor('locked')
    expect(policy.requiredRoles).toEqual([EXECUTIVE_ROLE])
    expect(requiresSeparateAuditEntry('locked')).toBe(true)
    expect(requiresSeparateAuditEntry('collecting')).toBe(false)
  })

  it('ยังไม่มีงวดบัญชีของเดือนนั้น (null) = ยังเก็บข้อมูลอยู่ ⇒ ใช้กติกาของ collecting', () => {
    expect(adjustmentApprovalPolicyFor(null)).toEqual(adjustmentApprovalPolicyFor('collecting'))
  })

  it('ชื่อ role ตรงกับชุดเดียวกับนโยบายล็อกรอบ (`13` §6.11) — ไม่ตั้งชื่อใหม่เอง', () => {
    const lockedPolicy = PERIOD_LOCK_POLICY.find((row) => row.status === 'locked')
    expect(lockedPolicy?.unlockApprovers).toContain(EXECUTIVE_ROLE)
    const collectingPolicy = PERIOD_LOCK_POLICY.find((row) => row.status === 'collecting')
    expect(collectingPolicy?.unlockApprovers).toContain(FINANCE_ROLE)
  })
})

describe('missingApproverRoles / assertApprovalLevelSufficient (`20` §11 · §16)', () => {
  it('รอบ locked แต่ผู้อนุมัติเป็นการเงิน → INSUFFICIENT_APPROVAL_LEVEL (403)', () => {
    expect(missingApproverRoles('locked', [FINANCE_ROLE])).toEqual([EXECUTIVE_ROLE])
    try {
      assertApprovalLevelSufficient({ periodStatus: 'locked', approverRoles: [FINANCE_ROLE] })
      expect.unreachable('ต้องโยน INSUFFICIENT_APPROVAL_LEVEL')
    } catch (error) {
      expect(isFinanceError(error)).toBe(true)
      if (isFinanceError(error)) {
        expect(error.code).toBe('INSUFFICIENT_APPROVAL_LEVEL')
        expect(error.status).toBe(403)
      }
    }
  })

  it('รอบ locked + ผู้บริหารอนุมัติ → ผ่าน', () => {
    expect(() =>
      assertApprovalLevelSufficient({ periodStatus: 'locked', approverRoles: [EXECUTIVE_ROLE] }),
    ).not.toThrow()
  })

  it('รอบ sent_to_accountant ต้องครบทั้งสอง role — ขาดตัวใดตัวหนึ่งไม่ผ่าน', () => {
    expect(() =>
      assertApprovalLevelSufficient({ periodStatus: 'sent_to_accountant', approverRoles: [FINANCE_ROLE] }),
    ).toThrow()
    expect(() =>
      assertApprovalLevelSufficient({ periodStatus: 'sent_to_accountant', approverRoles: [EXECUTIVE_ROLE] }),
    ).toThrow()
    expect(() =>
      assertApprovalLevelSufficient({
        periodStatus: 'sent_to_accountant',
        approverRoles: [FINANCE_ROLE, EXECUTIVE_ROLE],
      }),
    ).not.toThrow()
  })

  it('รอบ collecting: การเงินคนเดียวพอ', () => {
    expect(missingApproverRoles('collecting', [FINANCE_ROLE])).toEqual([])
    expect(() => assertApprovalLevelSufficient({ periodStatus: null, approverRoles: [FINANCE_ROLE] })).not.toThrow()
  })

  it('ยังไม่มีใครอนุมัติเลย → ขาดครบทุก role ที่ต้องใช้', () => {
    expect(missingApproverRoles('sent_to_accountant', [])).toEqual([FINANCE_ROLE, EXECUTIVE_ROLE])
  })
})

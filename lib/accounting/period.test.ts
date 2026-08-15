import { describe, expect, it } from 'vitest'
import { isAccountingError } from '@/lib/accounting/errors'
import {
  assertPeriodTransition,
  assertReadyToSend,
  assertUnlockAllowed,
  canTransitionPeriod,
  evaluateReadiness,
  nextPeriodKey,
  periodActionsFor,
  periodKeyOf,
  periodLabelOf,
  periodOrdinal,
  periodStatusLabel,
  periodYearCe,
  PERIOD_TRANSITIONS,
  type ReadinessInput,
} from '@/lib/accounting/period'

/** `30` §16 — Readiness Check 3 เงื่อนไข + state machine `23` §6.13 */

function codeOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    if (isAccountingError(error)) return error.code
    throw error
  }
  return 'NO_ERROR'
}

const readyInput: ReadinessInput = {
  criticalOpen: [],
  warningOpenCount: 0,
  unmatchedBankCount: 0,
  billingMismatches: [],
}

describe('ป้ายชื่อรอบ (พ.ศ. + เดือนไทย — Rule 01)', () => {
  it('ประกอบป้ายตรงรูปแบบ `billing_batches.period`', () => {
    expect(periodLabelOf({ yearBe: 2569, month: 6 })).toBe('มิถุนายน 2569')
    expect(periodLabelOf({ yearBe: 2569, month: 12 })).toBe('ธันวาคม 2569')
  })

  it('งวดของ instant ยึดปฏิทินไทย — เที่ยงคืนวันที่ 1 ตามเวลาไทยยังเป็นเดือนใหม่', () => {
    // 2026-05-31T17:00:00Z = 1 มิ.ย. 2026 00:00 ไทย ⇒ มิถุนายน 2569
    expect(periodKeyOf(new Date('2026-05-31T17:00:00Z'))).toEqual({ yearBe: 2569, month: 6 })
    // 2026-05-31T16:59:00Z = 31 พ.ค. 23:59 ไทย ⇒ ยังเป็นพฤษภาคม
    expect(periodKeyOf(new Date('2026-05-31T16:59:00Z'))).toEqual({ yearBe: 2569, month: 5 })
  })

  it('เดือนไม่ถูกต้อง → RangeError (ไม่ปล่อยป้ายเพี้ยน)', () => {
    expect(() => periodLabelOf({ yearBe: 2569, month: 13 })).toThrow(RangeError)
  })

  it('เดินงวดถัดไปข้ามปีได้ + เรียงลำดับเวลาถูก', () => {
    expect(nextPeriodKey({ yearBe: 2569, month: 12 })).toEqual({ yearBe: 2570, month: 1 })
    expect(periodOrdinal({ yearBe: 2570, month: 1 })).toBeGreaterThan(periodOrdinal({ yearBe: 2569, month: 12 }))
    expect(periodYearCe({ yearBe: 2569, month: 6 })).toBe(2026)
  })
})

describe('state machine ของรอบบัญชี (`23` §6.13)', () => {
  it('เดินตามลำดับ collecting → sent_to_accountant → locked', () => {
    expect(PERIOD_TRANSITIONS.collecting).toEqual(['sent_to_accountant'])
    expect(PERIOD_TRANSITIONS.sent_to_accountant).toEqual(['locked'])
  })

  it('ปลดล็อกกลับไป sent_to_accountant เท่านั้น ไม่กลับ collecting (`30` §9)', () => {
    expect(PERIOD_TRANSITIONS.locked).toEqual(['sent_to_accountant'])
    expect(canTransitionPeriod('locked', 'collecting')).toBe(false)
    expect(codeOf(() => assertPeriodTransition('locked', 'collecting'))).toBe('PERIOD_INVALID_STATUS')
  })

  it('ข้ามขั้น collecting → locked ไม่ได้', () => {
    expect(codeOf(() => assertPeriodTransition('collecting', 'locked'))).toBe('PERIOD_INVALID_STATUS')
  })

  it('ป้ายสถานะมาจากตารางนโยบาย `13` §6.11 ตัวเดียว', () => {
    expect(periodStatusLabel('locked')).toBe('ปิดรอบแล้ว')
    expect(periodStatusLabel('collecting')).toBe('กำลังรวบรวม')
  })
})

describe('ปลดล็อกรอบ locked (`30` §16)', () => {
  it('ไม่ใช่ผู้บริหาร → UNLOCK_REQUIRES_EXECUTIVE (403)', () => {
    expect(codeOf(() => assertUnlockAllowed(false))).toBe('UNLOCK_REQUIRES_EXECUTIVE')
  })

  it('ผู้บริหารผ่าน', () => {
    expect(() => assertUnlockAllowed(true)).not.toThrow()
  })
})

describe('Readiness Check 3 เงื่อนไข (`30` §6.2 · §16)', () => {
  it('ครบทั้ง 3 เงื่อนไข → ready', () => {
    const result = evaluateReadiness(readyInput)
    expect(result.ready).toBe(true)
    expect(result.checks.map((check) => check.key)).toEqual([
      'billing_revenue_sync',
      'bank_reconcile',
      'no_critical_exception',
    ])
    expect(() => assertReadyToSend(result)).not.toThrow()
  })

  it('มี critical เปิดอยู่ → NOT_READY_CRITICAL_OPEN พร้อมรายชื่อ', () => {
    const result = evaluateReadiness({
      ...readyInput,
      criticalOpen: [{ id: 'exc-1', title: 'ไม่มีใบเสร็จ', sourceModule: 'payout' }],
    })
    expect(result.ready).toBe(false)
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_CRITICAL_OPEN')
    try {
      assertReadyToSend(result)
    } catch (error) {
      if (!isAccountingError(error)) throw error
      expect(error.context?.criticalExceptions).toEqual([
        { id: 'exc-1', title: 'ไม่มีใบเสร็จ', sourceModule: 'payout' },
      ])
    }
  })

  it('กระทบยอดธนาคารไม่ครบ → NOT_READY_RECONCILE_INCOMPLETE', () => {
    const result = evaluateReadiness({ ...readyInput, unmatchedBankCount: 3 })
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_RECONCILE_INCOMPLETE')
    expect(result.checks.find((check) => check.key === 'bank_reconcile')?.passed).toBe(false)
  })

  it('ยอดบิลไม่ตรงรายได้ → NOT_READY_BILLING_REVENUE_MISMATCH', () => {
    const result = evaluateReadiness({
      ...readyInput,
      billingMismatches: [
        {
          billingBatchId: 'bb-1',
          companyName: 'ไฟแนนซ์ ก',
          batchTotalSatang: 10000,
          revenueTotalSatang: 12000,
          reason: 'total_mismatch',
        },
      ],
    })
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_BILLING_REVENUE_MISMATCH')
  })

  it('warning ผ่านได้แต่ต้องมีข้อความเตือน (`30` §6.2)', () => {
    const result = evaluateReadiness({ ...readyInput, warningOpenCount: 2 })
    expect(result.ready).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('2')
  })

  it('critical มาก่อนเสมอเมื่อผิดหลายข้อพร้อมกัน (ผู้ใช้ต้องเห็นตัวร้ายแรงสุดก่อน)', () => {
    const result = evaluateReadiness({
      criticalOpen: [{ id: 'exc-1', title: 'x', sourceModule: 'bank' }],
      warningOpenCount: 1,
      unmatchedBankCount: 5,
      billingMismatches: [
        {
          billingBatchId: null,
          companyName: 'ไฟแนนซ์ ข',
          batchTotalSatang: 0,
          revenueTotalSatang: 5000,
          reason: 'not_billed',
        },
      ],
    })
    expect(codeOf(() => assertReadyToSend(result))).toBe('NOT_READY_CRITICAL_OPEN')
  })
})

describe('ปุ่มบนแถวรอบบัญชี (`30` §8)', () => {
  const accountant = { canManagePeriod: true, canUnlockPeriod: false, canExportPack: true }
  const executive = { canManagePeriod: false, canUnlockPeriod: true, canExportPack: true }
  const viewer = { canManagePeriod: false, canUnlockPeriod: false, canExportPack: false }

  it('บัญชี: `collecting` ส่งได้ · `sent_to_accountant` ล็อกได้ · ปลดล็อกไม่ได้เลย (`30` §10)', () => {
    expect(periodActionsFor('collecting', accountant)).toMatchObject({ canSend: true, canLock: false, canUnlock: false })
    expect(periodActionsFor('sent_to_accountant', accountant)).toMatchObject({ canSend: false, canLock: true })
    expect(periodActionsFor('locked', accountant).canUnlock).toBe(false)
  })

  it('ผู้บริหาร: ล็อกงวดได้ (`30` §9 "บัญชี/Executive ยืนยันปิดงวด") และปลดล็อกได้คนเดียว', () => {
    expect(periodActionsFor('sent_to_accountant', executive).canLock).toBe(true)
    expect(periodActionsFor('locked', executive).canUnlock).toBe(true)
    // ส่งสำนักงานบัญชียังเป็นงานของบัญชี
    expect(periodActionsFor('collecting', executive).canSend).toBe(false)
  })

  it('คนที่ดูอย่างเดียว (การเงิน) ไม่มีปุ่มเปลี่ยนสถานะและ Export ไม่ได้', () => {
    for (const status of ['collecting', 'sent_to_accountant', 'locked'] as const) {
      expect(periodActionsFor(status, viewer)).toEqual({
        canSend: false,
        canLock: false,
        canUnlock: false,
        canExport: false,
      })
    }
  })

  it('ปุ่มยึด state machine เดียวกับ API — ไม่มีทางลัดข้ามขั้น', () => {
    expect(periodActionsFor('locked', accountant).canLock).toBe(false)
    expect(periodActionsFor('collecting', executive).canUnlock).toBe(false)
  })
})

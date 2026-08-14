import { describe, expect, it } from 'vitest'
import {
  evaluateRevenueTrigger,
  shouldCreateRevenue,
  type RevenueTriggerInput,
} from '@/lib/finance/revenue-trigger-rules'

/**
 * เทียบกับ Test Cases ของ `19` §16 (8 เคส) + DEC-006/D6 + `44` §17 T12/T13
 * — ทุกแถวในตาราง §6.1 ต้องมีเทสต์คุม
 */

function input(overrides: Partial<RevenueTriggerInput> = {}): RevenueTriggerInput {
  return {
    model: 'SUCCESS_FEE',
    chargeOnFail: null,
    outcome: 'closed_success',
    hasExpense: true,
    expenseState: 'approved',
    lotState: 'confirmed',
    ...overrides,
  }
}

describe('evaluateRevenueTrigger — SUCCESS_FEE (`19` §6.1)', () => {
  it('closed_success + expense approved + lot confirmed → เกิดรายได้ (§16 · `44` §17 T12)', () => {
    expect(evaluateRevenueTrigger(input())).toEqual({ shouldCreate: true })
  })

  it('closed_success + expense approved แต่ lot ยังไม่ confirmed → ยังไม่เกิด (§16 · T13 ฝั่งคลัง)', () => {
    expect(evaluateRevenueTrigger(input({ lotState: 'not_confirmed' }))).toEqual({
      shouldCreate: false,
      blockedBy: 'warehouse_gate',
    })
  })

  it('closed_success + lot confirmed แต่ expense ยังไม่ approved → ยังไม่เกิด (`44` §17 T13)', () => {
    expect(evaluateRevenueTrigger(input({ expenseState: 'not_approved' }))).toEqual({
      shouldCreate: false,
      blockedBy: 'expense_not_approved',
    })
  })

  it('closed_fail → ไม่เกิดเลย ไม่ว่าอย่างอื่นจะครบแค่ไหน', () => {
    expect(
      evaluateRevenueTrigger(input({ outcome: 'closed_fail', lotState: 'not_confirmed' })),
    ).toEqual({ shouldCreate: false, blockedBy: 'model_excludes_fail' })
  })

  it('chargeOnFail = true ไม่มีผลกับ SUCCESS_FEE — closed_fail ยังไม่เกิดรายได้', () => {
    expect(shouldCreateRevenue(input({ outcome: 'closed_fail', chargeOnFail: true }))).toBe(false)
  })
})

describe('evaluateRevenueTrigger — FLAT/HYBRID (`19` §6.1)', () => {
  it.each(['FLAT', 'HYBRID'] as const)('%s + charge_on_fail = true + closed_fail + expense approved → เกิด (§16)', (model) => {
    expect(
      shouldCreateRevenue(input({ model, chargeOnFail: true, outcome: 'closed_fail', lotState: 'not_confirmed' })),
    ).toBe(true)
  })

  it.each(['FLAT', 'HYBRID'] as const)('%s + charge_on_fail = false + closed_fail → ไม่เกิด', (model) => {
    expect(shouldCreateRevenue(input({ model, chargeOnFail: false, outcome: 'closed_fail' }))).toBe(false)
  })

  it('FLAT + charge_on_fail = true + closed_success ยังต้องผ่าน Warehouse gate (§6.1 วงเล็บท้ายบรรทัด)', () => {
    expect(
      evaluateRevenueTrigger(input({ model: 'FLAT', chargeOnFail: true, lotState: 'not_confirmed' })),
    ).toEqual({ shouldCreate: false, blockedBy: 'warehouse_gate' })
  })

  it('HYBRID + charge_on_fail = false + closed_success ครบ 3 เงื่อนไข → เกิด', () => {
    expect(shouldCreateRevenue(input({ model: 'HYBRID', chargeOnFail: false }))).toBe(true)
  })
})

describe('evaluateRevenueTrigger — เคสไม่มี expense (DEC-006/D6)', () => {
  it('closed_success ไม่มี expense เลย + lot ยังไม่ confirmed → ยังไม่เกิด (§16 แถวสุดท้าย)', () => {
    expect(
      evaluateRevenueTrigger(input({ hasExpense: false, expenseState: 'not_approved', lotState: 'not_confirmed' })),
    ).toEqual({ shouldCreate: false, blockedBy: 'warehouse_gate' })
  })

  it('closed_success ไม่มี expense + lot confirmed → เกิด (เงื่อนไข expense ตกไป แต่ gate ยังอยู่)', () => {
    expect(shouldCreateRevenue(input({ hasExpense: false, expenseState: 'not_approved' }))).toBe(true)
  })

  it('closed_fail ไม่มี expense + model คิดเงินกรณี fail → เกิดทันที ไม่ต้องผ่านคลัง (DEC-006/D6)', () => {
    expect(
      shouldCreateRevenue(
        input({
          model: 'FLAT',
          chargeOnFail: true,
          outcome: 'closed_fail',
          hasExpense: false,
          expenseState: 'not_approved',
          lotState: 'not_confirmed',
        }),
      ),
    ).toBe(true)
  })
})

describe('evaluateRevenueTrigger — ข้อมูลยังไม่พร้อม', () => {
  it('ไม่มี snapshot ค่าบริการ (เคสยังไม่ผ่าน approved) → ไม่เกิด', () => {
    expect(evaluateRevenueTrigger(input({ model: null }))).toEqual({
      shouldCreate: false,
      blockedBy: 'no_snapshot',
    })
  })

  it('เคสยังไม่มี outcome (ยังไม่ปิดงาน) → ไม่เกิด — เคสถูกตีกลับก่อน Revenue เกิด (§16)', () => {
    expect(evaluateRevenueTrigger(input({ outcome: null }))).toEqual({
      shouldCreate: false,
      blockedBy: 'no_outcome',
    })
  })

  it('FLAT ที่ยังไม่มี snapshot charge_on_fail (null) + closed_fail → ไม่เกิด (ไม่เดาว่าคิดเงิน)', () => {
    expect(shouldCreateRevenue(input({ model: 'FLAT', chargeOnFail: null, outcome: 'closed_fail' }))).toBe(false)
  })
})

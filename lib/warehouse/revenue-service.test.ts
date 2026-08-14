import { describe, expect, it } from 'vitest'
import {
  evaluateCaseRevenueGates,
  expenseGateOf,
  lotGateOf,
  type CaseRevenueSnapshot,
} from '@/lib/warehouse/revenue-service'

/**
 * **สัญญาของ `tryCreateRevenue()`** (`44` §11 step 4 · `19` §6.1 · DEC-006/D6)
 *
 * ⚠️ Phase 3.6 จะเสียบ RevenueService ตัวจริงแทน stub — เทสต์ไฟล์นี้ **ห้ามแก้** ตอนนั้น
 *    (`eligibleCaseIds` คือชุดที่ตัวจริงต้องสร้าง Revenue ให้พอดี ไม่ขาดไม่เกิน)
 */

function snapshot(overrides: Partial<CaseRevenueSnapshot> & { caseId: string }): CaseRevenueSnapshot {
  return {
    model: 'SUCCESS_FEE',
    chargeOnFail: null,
    outcome: 'closed_success',
    hasExpense: true,
    expenseState: 'approved',
    lotState: 'confirmed',
    hasRevenue: false,
    ...overrides,
  }
}

describe('expenseGateOf', () => {
  it('ไม่มีรายการเบิกเลย = hasExpense false (เกต expense ตกไป — DEC-006/D6)', () => {
    expect(expenseGateOf([])).toEqual({ hasExpense: false, expenseState: 'not_approved' })
  })

  it('อนุมัติครบทุกใบ = approved', () => {
    expect(expenseGateOf(['approved', 'approved'])).toEqual({ hasExpense: true, expenseState: 'approved' })
  })

  it('มีใบใดยังไม่อนุมัติ = not_approved (T13)', () => {
    expect(expenseGateOf(['approved', 'pending_approval']).expenseState).toBe('not_approved')
    expect(expenseGateOf(['pending_warehouse_confirm']).expenseState).toBe('not_approved')
  })

  it('ใบที่ถูกแทนที่/ถูกปฏิเสธไม่ค้างเกตไว้ (`41` §10.1)', () => {
    expect(expenseGateOf(['superseded', 'approved'])).toEqual({ hasExpense: true, expenseState: 'approved' })
    expect(expenseGateOf(['superseded', 'rejected'])).toEqual({ hasExpense: false, expenseState: 'not_approved' })
  })
})

describe('lotGateOf', () => {
  it('เคสที่ยังไม่มีเครื่องในระบบ = ยังไม่ผ่านคลัง', () => {
    expect(lotGateOf([])).toBe('not_confirmed')
  })

  it('เครื่องยังไม่เข้าล็อต = ยังไม่ผ่านคลัง', () => {
    expect(lotGateOf([null])).toBe('not_confirmed')
  })

  it('ต้อง confirmed ครบทุกเครื่องของเคส', () => {
    expect(lotGateOf(['confirmed'])).toBe('confirmed')
    expect(lotGateOf(['confirmed', 'pending_attach'])).toBe('not_confirmed')
  })
})

describe('evaluateCaseRevenueGates', () => {
  it('T12 — ครบทั้ง 3 เงื่อนไข = เข้าเงื่อนไขสร้าง Revenue', () => {
    const result = evaluateCaseRevenueGates([snapshot({ caseId: 'c1' })])
    expect(result.eligibleCaseIds).toEqual(['c1'])
    expect(result.skipped).toEqual([])
  })

  it('T13 — ล็อต confirmed แต่ expense ยังไม่อนุมัติ = ยังไม่เกิด', () => {
    const result = evaluateCaseRevenueGates([snapshot({ caseId: 'c1', expenseState: 'not_approved' })])
    expect(result.eligibleCaseIds).toEqual([])
    expect(result.skipped).toEqual([{ caseId: 'c1', reason: 'expense_not_approved' }])
  })

  it('🔑 Warehouse gate — closed_success ที่ไม่มี expense เลย ก็ยังต้องรอล็อต (DEC-006/D6)', () => {
    const noExpense = snapshot({ caseId: 'c1', hasExpense: false, expenseState: 'not_approved' })
    expect(evaluateCaseRevenueGates([{ ...noExpense, lotState: 'not_confirmed' }])).toMatchObject({
      eligibleCaseIds: [],
      skipped: [{ caseId: 'c1', reason: 'warehouse_gate' }],
    })
    expect(evaluateCaseRevenueGates([noExpense]).eligibleCaseIds).toEqual(['c1'])
  })

  it('เคสที่มี Revenue ของรอบนี้แล้วถูกข้าม — idempotent เรียกซ้ำกี่รอบก็ไม่เกิดซ้ำ', () => {
    const done = snapshot({ caseId: 'c1', hasRevenue: true })
    expect(evaluateCaseRevenueGates([done])).toEqual({
      eligibleCaseIds: [],
      skipped: [{ caseId: 'c1', reason: 'already_created' }],
    })
  })

  it('เคสที่ยังไม่มี snapshot ค่าบริการ = ยังตัดสินไม่ได้ (ไม่เดา)', () => {
    const result = evaluateCaseRevenueGates([snapshot({ caseId: 'c1', model: null })])
    expect(result.skipped).toEqual([{ caseId: 'c1', reason: 'no_snapshot' }])
  })

  it('closed_fail ของ SUCCESS_FEE ไม่เกิดรายได้ แม้ล็อตจะ confirmed', () => {
    const result = evaluateCaseRevenueGates([snapshot({ caseId: 'c1', outcome: 'closed_fail' })])
    expect(result.skipped).toEqual([{ caseId: 'c1', reason: 'model_excludes_fail' }])
  })

  it('FLAT ที่คิดเงินเมื่อไม่สำเร็จ = เกิดได้โดยไม่ต้องผ่านคลัง (closed_fail ไม่มีเครื่อง)', () => {
    const result = evaluateCaseRevenueGates([
      snapshot({
        caseId: 'c1',
        model: 'FLAT',
        chargeOnFail: true,
        outcome: 'closed_fail',
        lotState: 'not_confirmed',
      }),
    ])
    expect(result.eligibleCaseIds).toEqual(['c1'])
  })

  it('ตัดสินหลายเคสในล็อตเดียวแยกกัน — เคสที่ติดด่านไม่ฉุดเคสที่พร้อม', () => {
    const result = evaluateCaseRevenueGates([
      snapshot({ caseId: 'ready' }),
      snapshot({ caseId: 'blocked', expenseState: 'not_approved' }),
      snapshot({ caseId: 'done', hasRevenue: true }),
    ])
    expect(result.eligibleCaseIds).toEqual(['ready'])
    expect(result.skipped).toEqual([
      { caseId: 'blocked', reason: 'expense_not_approved' },
      { caseId: 'done', reason: 'already_created' },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINANCE_OPERATION_TAB,
  FINANCE_OPERATION_TABS,
  resolveFinanceOperationTab,
} from '@/lib/finance/operation-tabs'

/** ยามของโครงหน้าการเงิน (`06` §8 · mockup `finance.html`) — เพิ่ม/ลบแท็บต้องตั้งใจเสมอ */

describe('แท็บหน้าการเงิน', () => {
  it('มี 9 แท็บตามไฟล์ 14–21', () => {
    expect(FINANCE_OPERATION_TABS).toHaveLength(9)
  })

  it('id ไม่ซ้ำกัน', () => {
    const ids = FINANCE_OPERATION_TABS.map((tab) => tab.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('Phase 3.7 เปิดจริง 6 แท็บ: รออนุมัติ (15) + ค่าตอบแทน (16) + เงินทดรองจ่าย (15) + รอบจ่ายเงิน (17) + รายได้และวางบิล (19) + ปรับปรุง (20)', () => {
    const open = FINANCE_OPERATION_TABS.filter((tab) => tab.available).map((tab) => tab.id)
    expect(open).toEqual(['approval', 'comp', 'advances', 'payout', 'revenue', 'adjustment'])
  })

  it('แท็บที่ยังไม่เปิดต้องบอก Phase ปลายทางเสมอ (ไม่ปล่อยปุ่มหลอก)', () => {
    for (const tab of FINANCE_OPERATION_TABS.filter((item) => !item.available)) {
      expect(tab.plannedPhase, `แท็บ ${tab.id} ไม่ได้ระบุ phase`).toBeTruthy()
    }
  })

  it('`?tab=` ที่ชี้แท็บยังไม่เกิด/ไม่มีจริง ตกกลับแท็บเริ่มต้น', () => {
    expect(resolveFinanceOperationTab('profit')).toBe(DEFAULT_FINANCE_OPERATION_TAB)
    expect(resolveFinanceOperationTab('ไม่มีแท็บนี้')).toBe(DEFAULT_FINANCE_OPERATION_TAB)
    expect(resolveFinanceOperationTab(undefined)).toBe(DEFAULT_FINANCE_OPERATION_TAB)
  })

  it('แท็บที่เปิดแล้วถูกเลือกได้ตรงตัว', () => {
    expect(resolveFinanceOperationTab('comp')).toBe('comp')
    expect(resolveFinanceOperationTab('payout')).toBe('payout')
    expect(resolveFinanceOperationTab('approval')).toBe('approval')
    expect(resolveFinanceOperationTab('revenue')).toBe('revenue')
    expect(resolveFinanceOperationTab('adjustment')).toBe('adjustment')
  })
})

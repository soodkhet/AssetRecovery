import { describe, expect, it } from 'vitest'
import {
  ACCOUNTING_TABS,
  DEFAULT_ACCOUNTING_TAB,
  resolveAccountingTab,
} from '@/lib/accounting/accounting-tabs'

/**
 * ยามของทะเบียนแท็บหน้าบัญชี (`06` §8 · mockup `accounting.html`) — เปิดแท็บใหม่ต้องแก้ที่นี่ที่เดียว
 * และแท็บที่ยังไม่เกิดต้องระบุ Phase ปลายทางเสมอ (ไม่งั้นปุ่มเทาจะไม่บอกอะไรผู้ใช้เลย)
 */

describe('ทะเบียนแท็บหน้าบัญชี', () => {
  it('มี 9 แท็บตามไฟล์ 30–37 และ id ไม่ซ้ำ', () => {
    expect(ACCOUNTING_TABS).toHaveLength(9)
    expect(new Set(ACCOUNTING_TABS.map((tab) => tab.id)).size).toBe(9)
  })

  it('แท็บที่ยังไม่เปิดต้องบอก Phase ที่จะเกิด · แท็บที่เปิดแล้วไม่ต้องมี', () => {
    for (const tab of ACCOUNTING_TABS) {
      if (tab.available) expect(tab.plannedPhase, tab.id).toBeUndefined()
      else expect(tab.plannedPhase, tab.id).toBeTypeOf('string')
    }
  })

  it('แท็บที่เปิดแล้วถึง Phase 4.4 = ค่าใช้จ่าย · กระทบยอด · ข้อซักถาม', () => {
    expect(ACCOUNTING_TABS.filter((tab) => tab.available).map((tab) => tab.id)).toEqual([
      'expenses',
      'bank',
      'qa',
    ])
  })

  it('`?tab=` ที่ชี้แท็บยังไม่เกิด/ไม่มีจริง ตกกลับแท็บเริ่มต้นเสมอ', () => {
    expect(resolveAccountingTab('qa')).toBe('qa')
    expect(resolveAccountingTab('expenses')).toBe('expenses')
    expect(resolveAccountingTab('export')).toBe(DEFAULT_ACCOUNTING_TAB)
    expect(resolveAccountingTab('ไม่มีจริง')).toBe(DEFAULT_ACCOUNTING_TAB)
    expect(resolveAccountingTab(undefined)).toBe(DEFAULT_ACCOUNTING_TAB)
  })

  it('แท็บเริ่มต้นต้องเป็นแท็บที่เปิดใช้งานแล้วจริง', () => {
    expect(ACCOUNTING_TABS.find((tab) => tab.id === DEFAULT_ACCOUNTING_TAB)?.available).toBe(true)
  })
})

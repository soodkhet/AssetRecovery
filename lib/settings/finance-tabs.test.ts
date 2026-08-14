import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINANCE_SETTINGS_TAB,
  FINANCE_SETTINGS_TABS,
  resolveFinanceSettingsTab,
} from '@/lib/settings/finance-tabs'

/**
 * ยามของแท็บตั้งค่าบัญชี/การเงิน — `13` §16 ยืนยัน **13 แท็บของไฟล์ 13**
 * + 1 แท็บของ **ไฟล์ 18** ("ผู้รับเงิน") ที่ Phase 3.2 เพิ่มเข้ามาในหน้าเดียวกันตาม mockup
 */
describe('FINANCE_SETTINGS_TABS', () => {
  it('มีครบ 13 แท็บของไฟล์ 13 + แท็บผู้รับเงินของไฟล์ 18', () => {
    expect(FINANCE_SETTINGS_TABS).toHaveLength(14)
    expect(FINANCE_SETTINGS_TABS.filter((tab) => tab.section.startsWith('§'))).toHaveLength(13)
    expect(FINANCE_SETTINGS_TABS.find((tab) => tab.id === 'payee')?.section).toBe('ไฟล์ 18')
  })

  it('id ห้ามซ้ำ (ใช้เป็นค่า `?tab=` และ key ของ React)', () => {
    const ids = FINANCE_SETTINGS_TABS.map((tab) => tab.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('แท็บที่ยังไม่พร้อมต้องระบุ phase ที่จะทำ — ไม่ปล่อยค้างแบบไม่มีปลายทาง', () => {
    for (const tab of FINANCE_SETTINGS_TABS) {
      if (!tab.available) expect(tab.plannedPhase).toBeDefined()
    }
  })

  it('ทุกแท็บพร้อมใช้จริง (ชุดสุดท้าย = ผู้รับเงิน Phase 3.2) — ไม่เหลือ placeholder', () => {
    const available = FINANCE_SETTINGS_TABS.filter((tab) => tab.available).map((tab) => tab.id)
    expect(available).toEqual([
      'cycles',
      'approval',
      'bank',
      'payee',
      'tax',
      'vat',
      'cost',
      'docs',
      'bankfile',
      'export',
      'permission',
      'lock',
      'numbering',
      'taxdoc',
    ])
  })
})

describe('resolveFinanceSettingsTab', () => {
  it('คืนแท็บที่ขอเมื่อแท็บนั้นใช้งานได้จริง', () => {
    expect(resolveFinanceSettingsTab('bankfile')).toBe('bankfile')
  })

  it('แท็บชุดที่ 2 (Phase 1.12) และแท็บผู้รับเงิน (Phase 3.2) เปิดใช้ได้แล้ว', () => {
    expect(resolveFinanceSettingsTab('numbering')).toBe('numbering')
    expect(resolveFinanceSettingsTab('permission')).toBe('permission')
    expect(resolveFinanceSettingsTab('payee')).toBe('payee')
  })

  it('ค่าที่ไม่รู้จักหรือไม่ได้ส่งมา ตกกลับแท็บเริ่มต้น', () => {
    expect(resolveFinanceSettingsTab('ไม่มีแท็บนี้')).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
    expect(resolveFinanceSettingsTab(undefined)).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
  })
})

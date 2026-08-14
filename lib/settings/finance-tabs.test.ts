import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINANCE_SETTINGS_TAB,
  FINANCE_SETTINGS_TABS,
  resolveFinanceSettingsTab,
} from '@/lib/settings/finance-tabs'

/** ยามของแท็บตั้งค่าบัญชี/การเงิน — `13` §16 ยืนยัน 13 แท็บ (ไม่นับ Payee Profile ของไฟล์ 18) */
describe('FINANCE_SETTINGS_TABS', () => {
  it('มีครบ 13 แท็บตาม `13` §6.1–6.13', () => {
    expect(FINANCE_SETTINGS_TABS).toHaveLength(13)
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

  it('ครบ 13 แท็บพร้อมใช้จริงตั้งแต่ Phase 1.12 — ไม่เหลือ placeholder', () => {
    const available = FINANCE_SETTINGS_TABS.filter((tab) => tab.available).map((tab) => tab.id)
    expect(available).toEqual([
      'cycles',
      'approval',
      'bank',
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

  it('แท็บชุดที่ 2 (Phase 1.12) เปิดใช้ได้แล้ว — ไม่ตกกลับแท็บเริ่มต้นอีก', () => {
    expect(resolveFinanceSettingsTab('numbering')).toBe('numbering')
    expect(resolveFinanceSettingsTab('permission')).toBe('permission')
  })

  it('ค่าที่ไม่รู้จักหรือไม่ได้ส่งมา ตกกลับแท็บเริ่มต้น', () => {
    expect(resolveFinanceSettingsTab('ไม่มีแท็บนี้')).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
    expect(resolveFinanceSettingsTab(undefined)).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
  })
})

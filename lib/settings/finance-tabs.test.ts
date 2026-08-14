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

  it('Phase 1.11 ทำ 5 แท็บ: รอบบิล · สายอนุมัติ · ธนาคาร · ศูนย์ต้นทุน · ไฟล์โอนธนาคาร', () => {
    const available = FINANCE_SETTINGS_TABS.filter((tab) => tab.available).map((tab) => tab.id)
    expect(available).toEqual(['cycles', 'approval', 'bank', 'cost', 'bankfile'])
  })
})

describe('resolveFinanceSettingsTab', () => {
  it('คืนแท็บที่ขอเมื่อแท็บนั้นใช้งานได้จริง', () => {
    expect(resolveFinanceSettingsTab('bankfile')).toBe('bankfile')
  })

  it('แท็บที่ยังไม่เกิด (รอ 1.12) ตกกลับแท็บเริ่มต้น — ไม่พาไปหน้าว่าง', () => {
    expect(resolveFinanceSettingsTab('numbering')).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
  })

  it('ค่าที่ไม่รู้จักหรือไม่ได้ส่งมา ตกกลับแท็บเริ่มต้น', () => {
    expect(resolveFinanceSettingsTab('ไม่มีแท็บนี้')).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
    expect(resolveFinanceSettingsTab(undefined)).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
  })
})

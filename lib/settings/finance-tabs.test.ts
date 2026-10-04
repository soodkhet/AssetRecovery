import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINANCE_SETTINGS_TAB,
  FINANCE_SETTINGS_TABS,
  resolveFinanceSettingsTab,
  visibleFinanceSettingsTabs,
} from '@/lib/settings/finance-tabs'

const SUPER = { isSuperadmin: true, capabilities: {} }

/**
 * ยามของแท็บตั้งค่าบัญชี/การเงิน — `13` §16 ยืนยัน **13 แท็บของไฟล์ 13** + §6.14 ที่เพิ่มตามมติ PO
 * 15/08/2569 (D18 — เกณฑ์ SLA) + 1 แท็บของ **ไฟล์ 18** ("ผู้รับเงิน") ที่ Phase 3.2 เพิ่มเข้ามา
 */
describe('FINANCE_SETTINGS_TABS', () => {
  it('มีครบ 14 แท็บของไฟล์ 13 (13 + §6.14 SLA) + แท็บผู้รับเงินของไฟล์ 18 + นโยบายการมอบหมายงานของไฟล์ 40', () => {
    // + แท็บค่าตั้งภาษีหัก ณ ที่จ่าย §6.4.2 (มติ PO 05/10/2569 UAT U8)
    expect(FINANCE_SETTINGS_TABS).toHaveLength(17)
    expect(FINANCE_SETTINGS_TABS.filter((tab) => tab.section.startsWith('§'))).toHaveLength(15)
    expect(FINANCE_SETTINGS_TABS.find((tab) => tab.id === 'whtpolicy')?.section).toBe('§6.4.2')
    expect(FINANCE_SETTINGS_TABS.find((tab) => tab.id === 'payee')?.section).toBe('ไฟล์ 18')
    expect(FINANCE_SETTINGS_TABS.find((tab) => tab.id === 'sla')?.section).toBe('§6.14')
    // UAT BUG-002 · มติ PO 03/10/2569 — วางถัดจากแท็บ SLA (ตาราง `assignment_policy_settings` เดียวกัน)
    expect(FINANCE_SETTINGS_TABS.find((tab) => tab.id === 'assignment')?.section).toBe('ไฟล์ 40 §6.4')
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
      'whtpolicy',
      'vat',
      'cost',
      'docs',
      'bankfile',
      'export',
      'permission',
      'lock',
      'numbering',
      'taxdoc',
      'sla',
      'assignment',
    ])
  })
})

describe('resolveFinanceSettingsTab', () => {
  it('คืนแท็บที่ขอเมื่อแท็บนั้นใช้งานได้จริง', () => {
    expect(resolveFinanceSettingsTab('bankfile', SUPER)).toBe('bankfile')
  })

  it('แท็บชุดที่ 2 (Phase 1.12) · ผู้รับเงิน (Phase 3.2) · เกณฑ์ SLA (Phase 6.3) เปิดใช้ได้แล้ว', () => {
    expect(resolveFinanceSettingsTab('numbering', SUPER)).toBe('numbering')
    expect(resolveFinanceSettingsTab('permission', SUPER)).toBe('permission')
    expect(resolveFinanceSettingsTab('payee', SUPER)).toBe('payee')
    expect(resolveFinanceSettingsTab('sla', SUPER)).toBe('sla')
    expect(resolveFinanceSettingsTab('assignment', SUPER)).toBe('assignment')
  })

  it('ค่าที่ไม่รู้จักหรือไม่ได้ส่งมา ตกกลับแท็บเริ่มต้น', () => {
    expect(resolveFinanceSettingsTab('ไม่มีแท็บนี้', SUPER)).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
    expect(resolveFinanceSettingsTab(undefined, SUPER)).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
  })
})

describe('แท็บตามสิทธิ์ (UAT R6-C)', () => {
  it('บริหาร (ไม่มีสิทธิ์ payee ตาม `18` §12) ไม่เห็นแท็บผู้รับเงิน — ?tab=payee ตกกลับแท็บเริ่มต้น', () => {
    const executive = { isSuperadmin: false, capabilities: { view_master_data: 'view' as const } }
    expect(visibleFinanceSettingsTabs(executive).map((tab) => tab.id)).not.toContain('payee')
    expect(resolveFinanceSettingsTab('payee', executive)).toBe(DEFAULT_FINANCE_SETTINGS_TAB)
  })

  it('ผู้ถือ manage_payee_profile เห็นแท็บผู้รับเงิน', () => {
    const finance = { isSuperadmin: false, capabilities: { manage_payee_profile: 'manage' as const } }
    expect(resolveFinanceSettingsTab('payee', finance)).toBe('payee')
  })
})

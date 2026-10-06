import { describe, expect, it } from 'vitest'
import { ACCOUNTING_ROLE_NAME, EXECUTIVE_ROLE_NAME, SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import {
  filterSettingAssumptions,
  SETTING_ASSUMPTION_LOCATION,
  settingAssumptionCurrentValues,
  settingAssumptionHref,
  settingAssumptionHrefs,
  type AssumptionLinkViewer,
  type SettingAssumptionValueInputs,
} from '@/lib/settings/assumption-overview'
import { SETTING_ASSUMPTION_KEYS } from '@/lib/settings/assumptions'
import { FINANCE_SETTINGS_TABS } from '@/lib/settings/finance-tabs'
import { DEFAULT_WHT_POLICY } from '@/lib/settings/wht-policy'

/** มติ PO 07/10/2569 U170 (BUG-180) — หน้ารวม "ค่าตั้งรอนักบัญชียืนยัน" ในเมนูบัญชี */

const INPUTS: SettingAssumptionValueInputs = {
  whtPolicy: { ...DEFAULT_WHT_POLICY, incomeTypeMode: 'by_team_side' },
  taxProfiles: [{ name: 'Outsource Standard 3%', whtPct: 3, whtMinThresholdSatang: 100_000 }],
  holidays: { yearBe: 2569, count: 19 },
  vatRatePct: 7,
  invoiceNumbering: { pattern: 'INV-NNNN', nextNumberPreview: 'INV-0043' },
  costCenters: ['CC001 ทีมใน', 'CC002 ทีมนอก'],
  bankFileFormats: [
    { label: 'กสิกรไทย · CSV', usable: true },
    { label: 'กรุงเทพ · TXT', usable: false },
  ],
  writeOffToleranceSatang: 5_000,
}

const SUPER: AssumptionLinkViewer = { isSuperadmin: true, roleGroup: 'system', roleName: SUPERADMIN_ROLE_NAME, capabilities: {} }
const ACCOUNTANT: AssumptionLinkViewer = {
  isSuperadmin: false,
  roleGroup: 'system',
  roleName: ACCOUNTING_ROLE_NAME,
  capabilities: { view_master_data: 'view', manage_accountant_questions: 'manage', manage_holidays: 'manage' },
}

describe('settingAssumptionCurrentValues', () => {
  const values = settingAssumptionCurrentValues(INPUTS)

  it('มีค่าครบทุกรายการในทะเบียน และไม่ว่าง', () => {
    expect(Object.keys(values).sort()).toEqual([...SETTING_ASSUMPTION_KEYS].sort())
    for (const key of SETTING_ASSUMPTION_KEYS) expect(values[key].length).toBeGreaterThan(0)
  })

  it('อ่านจากค่าตั้งจริง — ประเภทเงินได้ · Tax Profile ขั้นต่ำ · วันหยุด · VAT · เลขที่ใบกำกับ · เพดานค่าธรรมเนียม', () => {
    expect(values.wht_income_type).toBe('แยกตามประเภททีม — Inhouse มาตรา 40(2) · Outsource มาตรา 40(8)')
    expect(values.wht_threshold).toBe('Outsource Standard 3% 3.00% ขั้นต่ำ ฿1,000.00')
    expect(values.holidays).toBe('ปี 2569 มี 19 วัน')
    expect(values.vat_rounding).toContain('7.00%')
    expect(values.invoice_numbering).toBe('รูปแบบ INV-NNNN · เลขถัดไป INV-0043')
    expect(values.bank_fee_write_off).toBe('เพดาน ฿50.00')
    expect(values.customer_wht_bank_fee).toBe(values.bank_fee_write_off)
    expect(values.bank_file_formats).toContain('กรุงเทพ · TXT (ยังไม่ผ่านการทดสอบ)')
    expect(values.wht_base).toContain('คอมมิชชั่น')
  })

  it('ยังไม่ตั้งค่า ⇒ บอกชัด (ไม่ว่าง ไม่เดาค่า)', () => {
    const empty = settingAssumptionCurrentValues({
      ...INPUTS,
      taxProfiles: [],
      vatRatePct: null,
      invoiceNumbering: null,
      costCenters: [],
      bankFileFormats: [],
    })
    expect(empty.wht_threshold).toBe('ยังไม่มี Tax Profile ที่ใช้งาน')
    expect(empty.vat_rounding).toContain('ยังไม่ตั้งอัตรา VAT')
    expect(empty.cost_centers).toBe('ยังไม่มีศูนย์ต้นทุนที่ใช้งาน')
  })

  it('ข้อความไม่มีเลขอ้างอิงสเปค', () => {
    for (const value of Object.values(values)) expect(value).not.toMatch(/§|ไฟล์ \d|U\d{2,}/)
  })
})

describe('settingAssumptionHref', () => {
  it('ทุกรายการชี้แท็บที่มีจริงในหน้าตั้งค่าบัญชี/การเงิน หรือหน้าตั้งค่าอื่น', () => {
    const tabIds = new Set(FINANCE_SETTINGS_TABS.map((tab) => tab.id))
    for (const key of SETTING_ASSUMPTION_KEYS) {
      const location = SETTING_ASSUMPTION_LOCATION[key]
      if ('financeTab' in location) expect(tabIds.has(location.financeTab), key).toBe(true)
    }
  })

  it('Superadmin เห็นลิงก์ทุกรายการ', () => {
    expect(settingAssumptionHref('wht_base', SUPER)).toBe('/settings/finance?tab=whtpolicy')
    expect(settingAssumptionHref('hotel_receipt', SUPER)).toBe('/settings/compensation')
    expect(Object.values(settingAssumptionHrefs(SUPER)).every((href) => href !== null)).toBe(true)
  })

  it('บัญชี (BUG-180) — เห็นลิงก์เฉพาะแท็บที่เปิดได้ (ปฏิทินวันหยุด) · ที่เหลือซ่อนลิงก์แต่ยังยืนยันได้จากหน้ารวม', () => {
    const links = settingAssumptionHrefs(ACCOUNTANT)
    expect(links.holidays).toBe('/settings/finance?tab=holidays')
    expect(links.wht_base).toBeNull()
    expect(links.customer_wht).toBeNull()
    expect(Object.values(links).filter((href) => href !== null)).toHaveLength(1)
  })

  it('บริหาร — เปิดหน้าตั้งค่าบัญชี/การเงินได้ ⇒ เห็นลิงก์แท็บ', () => {
    const executive: AssumptionLinkViewer = {
      isSuperadmin: false,
      roleGroup: 'system',
      roleName: EXECUTIVE_ROLE_NAME,
      capabilities: { view_master_data: 'view' },
    }
    expect(settingAssumptionHref('vat_rounding', executive)).toBe('/settings/finance?tab=vat')
  })
})

describe('filterSettingAssumptions', () => {
  const rows = [{ confirmed: true }, { confirmed: false }, { confirmed: false }]
  it('กรองตามสถานะ', () => {
    expect(filterSettingAssumptions(rows, 'all')).toHaveLength(3)
    expect(filterSettingAssumptions(rows, 'pending')).toHaveLength(2)
    expect(filterSettingAssumptions(rows, 'confirmed')).toHaveLength(1)
  })
})

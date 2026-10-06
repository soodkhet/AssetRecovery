import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { fmtCount, fmtPercent, fmtSatangSymbol } from '@/lib/format/money'
import { canViewMenu, type MenuViewer } from '@/lib/nav/menu-registry'
import type { SettingAssumptionKey, SettingAssumptionStatusDto } from '@/lib/settings/assumptions'
import { visibleFinanceSettingsTabs, type FinanceTabViewer } from '@/lib/settings/finance-tabs'
import {
  ALLOW_GROSS_UP_CONDITIONS_LABEL,
  WHT_CERTIFICATE_MODE_LABEL,
  WHT_FILING_METHOD_LABEL,
  WHT_INCOME_CATEGORY_LABEL,
  WHT_INCOME_TYPE_MODE_LABEL,
  type WhtPolicySettings,
} from '@/lib/settings/wht-policy'

/**
 * หน้ารวม "ค่าตั้งรอนักบัญชียืนยัน" ในเมนูบัญชี (มติ PO 07/10/2569 U170 · BUG-180) — pure ใช้ร่วม FE/BE
 *
 * - `settingAssumptionCurrentValues()` — สรุป**ค่าที่ใช้อยู่**ของแต่ละรายการในทะเบียน (`lib/settings/assumptions.ts`)
 *   จากค่าที่ query เดิมของแต่ละค่าตั้งคืนมา (อ่านอย่างเดียว) · รายการที่เป็นรูปแบบตายตัวของระบบ = ข้อความสรุปคงที่
 * - `settingAssumptionHref()` — ลิงก์ไปหน้าตั้งค่าของรายการนั้น **เฉพาะผู้ที่เปิดแท็บนั้นได้จริง** (UX — ไม่ใช่ security)
 *
 * ⚠️ ข้อความทุกช่องเป็นข้อความที่ผู้ใช้เห็น — ห้ามมีเลขอ้างอิงสเปค (Rule 05)
 */

/** ค่าจาก query เดิมของค่าตั้งแต่ละตัว (ชั้น DB ประกอบให้ — `loadSettingAssumptionValueInputs()`) */
export interface SettingAssumptionValueInputs {
  whtPolicy: WhtPolicySettings
  /** Tax Profile ที่ใช้งานอยู่ */
  taxProfiles: readonly { name: string; whtPct: number; whtMinThresholdSatang: number }[]
  /** วันหยุดของปีปัจจุบัน (พ.ศ.) */
  holidays: { yearBe: number; count: number }
  /** อัตรา VAT ที่มีผลวันนี้ — `null` = ยังไม่ตั้ง */
  vatRatePct: number | null
  /** เลขที่ใบกำกับภาษี — `null` = ไม่พบค่าตั้ง */
  invoiceNumbering: { pattern: string; nextNumberPreview: string } | null
  /** ชื่อศูนย์ต้นทุนที่ใช้งานอยู่ */
  costCenters: readonly string[]
  /** รูปแบบไฟล์ธนาคารที่ใช้งานอยู่ (`usable` = ทดสอบผ่าน ใช้สร้างไฟล์จริงได้) */
  bankFileFormats: readonly { label: string; usable: boolean }[]
  writeOffToleranceSatang: number
}

const FIXED_SYSTEM_TEXT = 'รูปแบบของระบบ (ไม่มีค่าให้เลือก) — ตามคำอธิบาย'

function joinOrNone(items: readonly string[], none: string): string {
  return items.length === 0 ? none : items.join(' · ')
}

/** ค่าที่ใช้อยู่ของทุกรายการในทะเบียน */
export function settingAssumptionCurrentValues(
  input: SettingAssumptionValueInputs,
): Record<SettingAssumptionKey, string> {
  const policy = input.whtPolicy
  const incomeType =
    policy.incomeTypeMode === 'by_team_side'
      ? `แยกตามประเภททีม — Inhouse ${WHT_INCOME_CATEGORY_LABEL[policy.inhouseIncomeCategory]} · Outsource ${WHT_INCOME_CATEGORY_LABEL[policy.outsourceIncomeCategory]}`
      : WHT_INCOME_TYPE_MODE_LABEL[policy.incomeTypeMode]
  const tolerance = `เพดาน ${fmtSatangSymbol(input.writeOffToleranceSatang)}`
  return {
    wht_income_type: incomeType,
    wht_base: `หักจาก: ${joinOrNone(
      policy.baseExpenseTypes.map((type) => EXPENSE_TYPE_LABEL[type]),
      'ไม่มีรายการในฐาน',
    )} · ฐานก่อน VAT`,
    wht_zero_rate_certificate: policy.issueZeroRate402Certificate
      ? 'ออกหนังสือรับรอง (ยอดภาษี 0) และรวมใน ภ.ง.ด.1'
      : 'ไม่ออกหนังสือรับรองเมื่อภาษีเป็น 0',
    wht_certificate_mode: WHT_CERTIFICATE_MODE_LABEL[policy.certificateMode],
    wht_threshold: joinOrNone(
      input.taxProfiles.map(
        (profile) =>
          `${profile.name} ${fmtPercent(profile.whtPct)} ขั้นต่ำ ${fmtSatangSymbol(profile.whtMinThresholdSatang)}`,
      ),
      'ยังไม่มี Tax Profile ที่ใช้งาน',
    ),
    wht_filing_method: WHT_FILING_METHOD_LABEL[policy.filingMethod],
    wht_gross_up: policy.allowGrossUpConditions
      ? `เปิด — ${ALLOW_GROSS_UP_CONDITIONS_LABEL}`
      : 'ปิด — หักจากผู้รับเงินเท่านั้น',
    holidays: `ปี ${input.holidays.yearBe} มี ${fmtCount(input.holidays.count)} วัน`,
    vat_rounding:
      input.vatRatePct === null
        ? 'ยังไม่ตั้งอัตรา VAT ที่มีผลวันนี้ · คำนวณต่อเคสแล้วรวมเป็นยอดใบ'
        : `อัตรา VAT ที่มีผลวันนี้ ${fmtPercent(input.vatRatePct)} · คำนวณต่อเคสแล้วรวมเป็นยอดใบ`,
    tax_invoice_fields: FIXED_SYSTEM_TEXT,
    invoice_numbering:
      input.invoiceNumbering === null
        ? 'ยังไม่พบค่าตั้งเลขที่ใบกำกับภาษี'
        : `รูปแบบ ${input.invoiceNumbering.pattern} · เลขถัดไป ${input.invoiceNumbering.nextNumberPreview}`,
    internal_documents: FIXED_SYSTEM_TEXT,
    export_pack: FIXED_SYSTEM_TEXT,
    cost_centers: joinOrNone(input.costCenters, 'ยังไม่มีศูนย์ต้นทุนที่ใช้งาน'),
    bank_file_formats: joinOrNone(
      input.bankFileFormats.map((format) => `${format.label}${format.usable ? '' : ' (ยังไม่ผ่านการทดสอบ)'}`),
      'ยังไม่มีรูปแบบไฟล์ที่ใช้งาน',
    ),
    hotel_receipt: FIXED_SYSTEM_TEXT,
    adjustment_after_close: FIXED_SYSTEM_TEXT,
    customer_wht: FIXED_SYSTEM_TEXT,
    bank_fee_write_off: tolerance,
    customer_wht_bank_fee: tolerance,
    bank_fee_full_tax_invoice: FIXED_SYSTEM_TEXT,
  }
}

/** ที่ตั้งของค่าตั้งแต่ละรายการ — แท็บในหน้าตั้งค่าบัญชี/การเงิน หรือหน้าตั้งค่าอื่น */
type AssumptionLocation = { financeTab: string } | { menuId: string; path: string }

const FINANCE_SETTINGS_PATH = '/settings/finance'

export const SETTING_ASSUMPTION_LOCATION: Readonly<Record<SettingAssumptionKey, AssumptionLocation>> = {
  wht_income_type: { financeTab: 'whtpolicy' },
  wht_base: { financeTab: 'whtpolicy' },
  wht_zero_rate_certificate: { financeTab: 'whtpolicy' },
  wht_certificate_mode: { financeTab: 'whtpolicy' },
  wht_threshold: { financeTab: 'tax' },
  wht_filing_method: { financeTab: 'whtpolicy' },
  wht_gross_up: { financeTab: 'whtpolicy' },
  holidays: { financeTab: 'holidays' },
  vat_rounding: { financeTab: 'vat' },
  tax_invoice_fields: { financeTab: 'taxdoc' },
  invoice_numbering: { financeTab: 'numbering' },
  internal_documents: { financeTab: 'docs' },
  export_pack: { financeTab: 'export' },
  cost_centers: { financeTab: 'cost' },
  bank_file_formats: { financeTab: 'bankfile' },
  hotel_receipt: { menuId: 'settings.compensation', path: '/settings/compensation' },
  adjustment_after_close: { financeTab: 'lock' },
  customer_wht: { menuId: 'settings.companies', path: '/settings/companies' },
  bank_fee_write_off: { financeTab: 'approval' },
  customer_wht_bank_fee: { financeTab: 'approval' },
  bank_fee_full_tax_invoice: { financeTab: 'approval' },
}

export type AssumptionLinkViewer = MenuViewer & FinanceTabViewer

/** ลิงก์ไปหน้าตั้งค่าของรายการนี้ — `null` = ผู้ใช้เปิดหน้า/แท็บนั้นไม่ได้ (ซ่อนลิงก์) */
export function settingAssumptionHref(key: SettingAssumptionKey, viewer: AssumptionLinkViewer): string | null {
  const location = SETTING_ASSUMPTION_LOCATION[key]
  if ('menuId' in location) return canViewMenu(viewer, location.menuId) ? location.path : null
  if (!canViewMenu(viewer, 'settings.finance')) return null
  const visible = visibleFinanceSettingsTabs(viewer).some((tab) => tab.id === location.financeTab && tab.available)
  return visible ? `${FINANCE_SETTINGS_PATH}?tab=${location.financeTab}` : null
}

/** ลิงก์ของทุกรายการสำหรับผู้ใช้คนนี้ (server component ส่งให้หน้ารวม) */
export function settingAssumptionHrefs(viewer: AssumptionLinkViewer): Record<SettingAssumptionKey, string | null> {
  return Object.fromEntries(
    (Object.keys(SETTING_ASSUMPTION_LOCATION) as SettingAssumptionKey[]).map((key) => [
      key,
      settingAssumptionHref(key, viewer),
    ]),
  ) as Record<SettingAssumptionKey, string | null>
}

/** 1 แถวของหน้ารวม = สถานะยืนยัน + ค่าที่ใช้อยู่ (`GET /api/settings/assumptions?include=current_value`) */
export interface SettingAssumptionOverviewDto extends SettingAssumptionStatusDto {
  currentValue: string
}

export type SettingAssumptionStatusFilter = 'all' | 'pending' | 'confirmed'

export function filterSettingAssumptions<T extends Pick<SettingAssumptionStatusDto, 'confirmed'>>(
  rows: readonly T[],
  filter: SettingAssumptionStatusFilter,
): T[] {
  if (filter === 'all') return [...rows]
  return rows.filter((row) => row.confirmed === (filter === 'confirmed'))
}

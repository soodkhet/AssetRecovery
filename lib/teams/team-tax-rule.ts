import { fmtPercent } from '@/lib/format/money'
import type { PayeeType } from '@/lib/generated/prisma/enums'
import { canViewMenu, type MenuViewer } from '@/lib/nav/menu-registry'
import { visibleFinanceSettingsTabs, type FinanceTabViewer } from '@/lib/settings/finance-tabs'
import { pickTaxProfileDefault, type TaxProfileDefaults } from '@/lib/settings/tax-profile-defaults'
import {
  resolveIncomeCategory,
  usesPerPayeeWhtRate,
  WHT_INCOME_CATEGORY_LABEL,
  type WhtPolicyValues,
} from '@/lib/settings/wht-policy'
import type { TeamSide } from '@/lib/teams/team'

/**
 * **กติกาภาษีของผู้รับในทีม** แบบอ่านอย่างเดียว (มติ PO 07/10/2569 U161 · `09` §7) — pure ใช้บนฟอร์มทีม
 *
 * ทีมไม่มีช่องเลือก Tax Profile (กติกาภาษีผูกประเภทผู้รับตาม U121 — ฝั่งทีม × ชนิดผู้รับ) ฟอร์มจึงแค่**อธิบาย**
 * ว่าผู้รับในทีมฝั่งนี้ถูกหักภาษีอย่างไร โดยอ่านจากค่าตั้งจริง 2 ตัว:
 * - ประเภทเงินได้ของฝั่ง (ค่าตั้งภาษีหัก ณ ที่จ่าย — `resolveIncomeCategory()` ตัวเดียวกับรอบจ่าย)
 *   · 40(1)/40(2) ⇒ บุคคลธรรมดาหักตาม**อัตรารายคน** (`payee_profiles.wht_40_2_pct`)
 * - Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (ชุดล่าสุดของ `tax_profile_default_history`) ⇒ ชื่อ + %
 *   · ยังไม่ตั้ง ⇒ ข้อความเตือน
 *
 * ค่าเริ่มต้นของระบบ (โหมดแยกตามประเภททีม: inhouse = 40(2) · outsource = 40(8)) ได้ผลตรงมติ U161:
 * inhouse = หัก 40(2) ตามอัตรารายคน · outsource = Tax Profile ค่าเริ่มต้น บุคคลธรรมดา / นิติบุคคล
 * · ผู้รับที่ตั้ง Tax Profile รายคนไว้ใช้ค่ารายคนแทน (ลำดับ resolve เดิม — ไม่เปลี่ยนสูตร)
 */

/** ค่าที่ต้องใช้ของ Tax Profile หนึ่งช่อง (ตรงกับ `TaxProfileDefaultSlotDto`) */
export interface TeamTaxRuleProfile {
  name: string
  whtPct: number
}

export interface TeamTaxRuleLine {
  payeeType: PayeeType
  /** "บุคคลธรรมดา" / "นิติบุคคล" */
  payeeTypeLabel: string
  /** `per_payee_rate` = อัตรารายคน · `tax_profile` = Tax Profile ค่าเริ่มต้น · `missing` = ยังไม่ตั้งค่าเริ่มต้น */
  kind: 'per_payee_rate' | 'tax_profile' | 'missing'
  /** ป้ายประเภทเงินได้ — เฉพาะ `per_payee_rate` (เช่น "มาตรา 40(2)") */
  incomeLabel: string | null
  profile: TeamTaxRuleProfile | null
}

const PAYEE_TYPE_LABEL: Record<PayeeType, string> = {
  individual: 'บุคคลธรรมดา',
  corporate: 'นิติบุคคล',
}

const PAYEE_TYPES: readonly PayeeType[] = ['individual', 'corporate']

export function teamTaxRuleLines(
  side: TeamSide,
  policy: Pick<WhtPolicyValues, 'incomeTypeMode' | 'inhouseIncomeCategory' | 'outsourceIncomeCategory'>,
  defaults: TaxProfileDefaults<TeamTaxRuleProfile>,
): TeamTaxRuleLine[] {
  return PAYEE_TYPES.map((payeeType) => {
    const category = resolveIncomeCategory(policy, side, payeeType)
    const base = { payeeType, payeeTypeLabel: PAYEE_TYPE_LABEL[payeeType] }
    if (usesPerPayeeWhtRate(category)) {
      return { ...base, kind: 'per_payee_rate', incomeLabel: WHT_INCOME_CATEGORY_LABEL[category], profile: null }
    }
    const profile = pickTaxProfileDefault(defaults, side, payeeType)
    return profile === null
      ? { ...base, kind: 'missing', incomeLabel: null, profile: null }
      : { ...base, kind: 'tax_profile', incomeLabel: null, profile: { name: profile.name, whtPct: profile.whtPct } }
  })
}

/**
 * **ค่าที่ใช้จริงเมื่อไม่ผูก Tax Profile รายคน** (มติ PO 07/10/2569 U164 · `18` §7.1) — ตัวเลือกแรกของช่อง
 * "กติกาภาษี (Tax Profile)" ในฟอร์มผู้ใช้ (U131) และหน้าผู้รับเงิน · ใช้ `teamTaxRuleLines()` ตัวเดียวกับฟอร์มทีม
 * (ไม่ resolve ซ้ำ) แล้วเลือกบรรทัดของชนิดผู้รับ
 *
 * `side` = ฝั่งของผู้รับแบบเดียวกับรอบจ่าย (`resolvePayoutSide()` — ทีม → กลุ่ม role) · `null` = ไม่มีฝั่ง
 * (เช่น role ระบบ) ⇒ ไม่มีค่าเริ่มต้นให้ใช้ ⇒ `null`
 */
export function payeeDefaultTaxRule(
  side: TeamSide | null,
  payeeType: PayeeType,
  policy: Parameters<typeof teamTaxRuleLines>[1],
  defaults: TaxProfileDefaults<TeamTaxRuleProfile>,
): TeamTaxRuleLine | null {
  if (side === null) return null
  return teamTaxRuleLines(side, policy, defaults).find((line) => line.payeeType === payeeType) ?? null
}

const SIDE_LABEL: Record<TeamSide, string> = { inhouse: 'Inhouse', outsource: 'Outsource' }

/** ข้อความตัวเลือกแรก (ค่าที่บันทึก = ไม่ผูก/`null` เสมอ) — `line === null` = ไม่มีฝั่ง */
export function payeeDefaultTaxOptionLabel(side: TeamSide | null, line: TeamTaxRuleLine | null): string {
  if (side === null || line === null) return 'ไม่มีค่าเริ่มต้นที่ใช้ได้ — กรุณาเลือก'
  if (line.kind === 'per_payee_rate') {
    const income = (line.incomeLabel ?? '').replace(/^มาตรา\s*/, '')
    return `หัก ${income} ตามอัตรารายคนด้านล่าง (แนะนำ)`
  }
  if (line.kind === 'tax_profile' && line.profile !== null) {
    return `ตามค่าเริ่มต้นของทีม ${SIDE_LABEL[side]} — ${line.profile.name} ${fmtPercent(line.profile.whtPct)} (แนะนำ)`
  }
  return `ยังไม่ตั้งค่าเริ่มต้นของทีม ${SIDE_LABEL[side]} (${line.payeeTypeLabel}) — กรุณาเลือก`
}

/** ต้องเตือนให้ตั้งค่าเริ่มต้น/เลือกเอง — ไม่มีฝั่ง หรือฝั่งนี้ยังไม่ตั้ง Tax Profile ค่าเริ่มต้นของชนิดผู้รับ */
export function payeeDefaultTaxMissing(line: TeamTaxRuleLine | null): boolean {
  return line === null || line.kind === 'missing'
}

/** ป้ายต่อท้ายตัวเลือก Tax Profile อื่น (ผูกรายคน = override) */
export const PER_PAYEE_TAX_PROFILE_SUFFIX = '(กำหนดเฉพาะคนนี้)'

/** ปลายทางลิงก์ "ไปแท็บ Tax Profile" */
export const TAX_PROFILE_TAB_PATH = '/settings/finance?tab=tax'

/** แสดงลิงก์ไปแท็บ Tax Profile เฉพาะผู้ที่เปิดหน้าตั้งค่าบัญชี/การเงินและเห็นแท็บนั้นได้จริง (UX — ไม่ใช่ security) */
export function canOpenTaxProfileTab(viewer: MenuViewer & FinanceTabViewer): boolean {
  return (
    canViewMenu(viewer, 'settings.finance') &&
    visibleFinanceSettingsTabs(viewer).some((tab) => tab.id === 'tax' && tab.available)
  )
}

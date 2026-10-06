import { describe, expect, it } from 'vitest'
import { emptyTaxProfileDefaults } from '@/lib/settings/tax-profile-defaults'
import type { WhtPolicyValues } from '@/lib/settings/wht-policy'
import { canOpenTaxProfileTab, teamTaxRuleLines, type TeamTaxRuleProfile } from '@/lib/teams/team-tax-rule'

/** มติ PO U161 — กติกาภาษีของผู้รับในทีม (อ่านอย่างเดียว) */

type Policy = Pick<WhtPolicyValues, 'incomeTypeMode' | 'inhouseIncomeCategory' | 'outsourceIncomeCategory'>

/** ค่าเริ่มต้นของระบบ: แยกตามประเภททีม inhouse = 40(2) · outsource = 40(8) */
const BY_SIDE: Policy = { incomeTypeMode: 'by_team_side', inhouseIncomeCategory: 'sec_40_2', outsourceIncomeCategory: 'sec_40_8' }

const DEFAULTS = {
  ...emptyTaxProfileDefaults<TeamTaxRuleProfile>(),
  outsourceIndividual: { name: 'Outsource บุคคล 3%', whtPct: 3 },
  outsourceCorporate: { name: 'Outsource นิติ 3%', whtPct: 3 },
  inhouseCorporate: { name: 'Inhouse นิติ 3%', whtPct: 3 },
}

describe('teamTaxRuleLines', () => {
  it('inhouse (ค่าตั้งเริ่มต้น) — บุคคลธรรมดาหัก 40(2) ตามอัตรารายคน · นิติบุคคลใช้ Tax Profile ค่าเริ่มต้น', () => {
    const [individual, corporate] = teamTaxRuleLines('inhouse', BY_SIDE, DEFAULTS)
    expect(individual).toMatchObject({ payeeType: 'individual', kind: 'per_payee_rate', incomeLabel: 'มาตรา 40(2)' })
    expect(corporate).toMatchObject({ payeeType: 'corporate', kind: 'tax_profile', profile: { name: 'Inhouse นิติ 3%', whtPct: 3 } })
  })

  it('outsource — Tax Profile ค่าเริ่มต้น บุคคลธรรมดา / นิติบุคคล พร้อมชื่อ + %', () => {
    const lines = teamTaxRuleLines('outsource', BY_SIDE, DEFAULTS)
    expect(lines.map((line) => [line.kind, line.profile?.name])).toEqual([
      ['tax_profile', 'Outsource บุคคล 3%'],
      ['tax_profile', 'Outsource นิติ 3%'],
    ])
  })

  it('ยังไม่ตั้งค่าเริ่มต้น ⇒ missing (หน้าจอแสดงข้อความเตือน)', () => {
    const lines = teamTaxRuleLines('outsource', BY_SIDE, emptyTaxProfileDefaults<TeamTaxRuleProfile>())
    expect(lines.map((line) => line.kind)).toEqual(['missing', 'missing'])
  })

  it('อ่านตามค่าตั้งจริง — โหมด 40(8) ทั้งหมด ⇒ inhouse บุคคลธรรมดาก็ใช้ Tax Profile ค่าเริ่มต้น', () => {
    const lines = teamTaxRuleLines('inhouse', { ...BY_SIDE, incomeTypeMode: 'all_40_8' }, DEFAULTS)
    expect(lines[0]?.kind).toBe('missing')
  })

  it('outsource ตั้งเป็น 40(1) ⇒ บุคคลธรรมดาใช้อัตรารายคน · นิติบุคคลยังใช้ Tax Profile', () => {
    const lines = teamTaxRuleLines('outsource', { ...BY_SIDE, outsourceIncomeCategory: 'sec_40_1' }, DEFAULTS)
    expect(lines.map((line) => line.kind)).toEqual(['per_payee_rate', 'tax_profile'])
    expect(lines[0]?.incomeLabel).toBe('มาตรา 40(1)')
  })
})

describe('canOpenTaxProfileTab', () => {
  it('Superadmin เห็นลิงก์', () => {
    expect(canOpenTaxProfileTab({ isSuperadmin: true, roleGroup: 'system', roleName: 'Superadmin', capabilities: {} })).toBe(true)
  })

  it('ผู้ที่เปิดหน้าตั้งค่าบัญชี/การเงินไม่ได้ ⇒ ไม่เห็นลิงก์', () => {
    expect(
      canOpenTaxProfileTab({ isSuperadmin: false, roleGroup: 'system', roleName: 'ธุรการ', capabilities: { view_master_data: 'view' } }),
    ).toBe(false)
  })
})

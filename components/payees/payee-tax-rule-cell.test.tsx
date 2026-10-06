import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PayeeTaxRuleCell } from '@/components/payees/payee-tax-rule-cell'
import type { TaxRuleSettings } from '@/components/teams/use-tax-rule-settings'
import type { PayeeDto } from '@/lib/payees/types'
import { emptyTaxProfileDefaults } from '@/lib/settings/tax-profile-defaults'
import { DEFAULT_WHT_POLICY } from '@/lib/settings/wht-policy'
import type { TeamTaxRuleProfile } from '@/lib/teams/team-tax-rule'

/** BUG-181 (มติ PO U164 · O74) — คอลัมน์ภาษีหน้าผู้รับเงิน */
describe('<PayeeTaxRuleCell>', () => {
  const settings: TaxRuleSettings = {
    policy: { ...DEFAULT_WHT_POLICY, incomeTypeMode: 'by_team_side', inhouseIncomeCategory: 'sec_40_2', outsourceIncomeCategory: 'sec_40_8' },
    defaults: { ...emptyTaxProfileDefaults<TeamTaxRuleProfile>(), outsourceIndividual: { name: 'Outsource Standard 3%', whtPct: 3 } },
  }
  const in1 = {
    payoutSide: 'inhouse',
    payeeType: 'individual',
    taxProfileName: 'Outsource Standard 3%',
    whtPct: 3,
    wht402Pct: 5,
  } as PayeeDto

  it('inhouse ที่ผูก Tax Profile 3% ⇒ แสดง "หัก 40(2) ตามอัตรารายคน 5.00%" ไม่ใช่ 3%', () => {
    const html = renderToStaticMarkup(<PayeeTaxRuleCell payee={in1} settings={settings} />)
    expect(html).toContain('หัก 40(2) ตามอัตรารายคน 5.00%')
    expect(html).toContain('ไม่มีผลกับผู้รับรายนี้')
    expect(html).not.toContain('>3.00%<')
  })

  it('outsource ไม่ผูกรายคน ⇒ ค่าเริ่มต้นตามประเภทผู้รับ (ไม่ขึ้น "ยังไม่ผูก")', () => {
    const out = { ...in1, payoutSide: 'outsource', taxProfileName: null, whtPct: null } as PayeeDto
    const html = renderToStaticMarkup(<PayeeTaxRuleCell payee={out} settings={settings} />)
    expect(html).toContain('3.00%')
    expect(html).toContain('ค่าเริ่มต้นตามประเภทผู้รับ')
    expect(html).not.toMatch(/§|ไฟล์ \d/)
  })
})

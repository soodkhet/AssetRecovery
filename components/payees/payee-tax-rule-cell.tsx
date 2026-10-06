'use client'

import type { TaxRuleSettings } from '@/components/teams/use-tax-rule-settings'
import { fmtPercent } from '@/lib/format/money'
import type { PayeeDto } from '@/lib/payees/types'
import { payeeDefaultTaxRule, payeeEffectiveTaxRule } from '@/lib/teams/team-tax-rule'

/**
 * คอลัมน์ "ภาษี" ของรายการผู้รับเงิน (มติ PO U164 · BUG-181) — แสดง**กติกาที่ใช้จริง**ตามลำดับเดียวกับรอบจ่าย
 * (`payeeEffectiveTaxRule()`): inhouse บุคคลธรรมดา = "หัก 40(2) ตามอัตรารายคน X%" แม้จะผูก Tax Profile ไว้
 * · ค่าตั้งยังโหลดไม่เสร็จ/โหลดไม่ได้ ⇒ แสดงค่า Tax Profile ที่ผูกไว้แบบเดิม (ไม่ขวางรายการ)
 */
export function PayeeTaxRuleCell({ payee, settings }: { payee: PayeeDto; settings: TaxRuleSettings | null }) {
  if (settings === null) {
    return payee.whtPct === null ? (
      <span className="text-[10px] text-slate-500">ตามค่าเริ่มต้นตามประเภทผู้รับ</span>
    ) : (
      <>
        <span className="text-xs font-semibold text-slate-800">{fmtPercent(payee.whtPct)}</span>
        <div className="text-[10px] text-slate-500">{payee.taxProfileName}</div>
      </>
    )
  }
  const line = payeeDefaultTaxRule(payee.payoutSide, payee.payeeType, settings.policy, settings.defaults)
  const summary = payeeEffectiveTaxRule(line, payee)
  return (
    <>
      <span className={summary.warning ? 'text-[10px] font-semibold text-amber-600' : 'text-xs font-semibold text-slate-800'}>
        {summary.label}
      </span>
      {summary.detail !== null && <div className="text-[10px] text-slate-500">{summary.detail}</div>}
    </>
  )
}

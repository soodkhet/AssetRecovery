'use client'

import Link from 'next/link'
import { useSession } from '@/components/auth/permission-provider'
import { useTaxRuleSettings } from '@/components/teams/use-tax-rule-settings'
import { InlineAlert, Skeleton } from '@/components/ui'
import { fmtPercent } from '@/lib/format/money'
import type { TeamSide } from '@/lib/teams/team'
import {
  canOpenTaxProfileTab,
  TAX_PROFILE_TAB_PATH,
  teamTaxRuleLines,
  type TeamTaxRuleLine,
} from '@/lib/teams/team-tax-rule'

/**
 * กล่อง "กติกาภาษีของผู้รับในทีมนี้" บนฟอร์มทีม (มติ PO U161 · `09` §7) — **อ่านอย่างเดียว ไม่มีช่องเลือก**
 *
 * อ่านค่าตั้งจริงผ่าน `useTaxRuleSettings()` (wht-policy + tax-profile-defaults · `view:view_master_data`) แล้วให้ `teamTaxRuleLines()` สรุปตามฝั่งของทีม
 * · ลิงก์ไปแท็บ Tax Profile แสดงเฉพาะผู้ที่เปิดแท็บนั้นได้ (`canOpenTaxProfileTab()`)
 */

function LineText({ line }: { line: TeamTaxRuleLine }) {
  if (line.kind === 'per_payee_rate') {
    return (
      <>
        หัก ณ ที่จ่าย {line.incomeLabel} ตามอัตรารายคน
        <span className="text-slate-500"> (ตั้งที่ข้อมูลผู้รับเงินแต่ละคน)</span>
      </>
    )
  }
  if (line.kind === 'tax_profile' && line.profile !== null) {
    return (
      <>
        Tax Profile ค่าเริ่มต้น: <span className="font-semibold">{line.profile.name}</span> ({fmtPercent(line.profile.whtPct)})
      </>
    )
  }
  return <span className="text-amber-700">ยังไม่ตั้ง Tax Profile ค่าเริ่มต้นสำหรับประเภทนี้</span>
}

export function TeamTaxRuleNotice({ side }: { side: TeamSide }) {
  const session = useSession()
  const { data, error } = useTaxRuleSettings()

  const showLink = session !== null && canOpenTaxProfileTab(session)

  return (
    <section
      aria-label="กติกาภาษีของผู้รับในทีมนี้"
      className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-600">กติกาภาษีของผู้รับในทีมนี้ (อ่านอย่างเดียว)</h3>
        {showLink && (
          <Link href={TAX_PROFILE_TAB_PATH} className="text-xs font-semibold text-emerald-700 hover:underline">
            ไปแท็บ Tax Profile →
          </Link>
        )}
      </div>

      {error !== null ? (
        <InlineAlert tone="error">{error}</InlineAlert>
      ) : data === null ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <>
          <ul className="space-y-1">
            {teamTaxRuleLines(side, data.policy, data.defaults).map((line) => (
              <li key={line.payeeType}>
                <span className="font-semibold">{line.payeeTypeLabel}:</span> <LineText line={line} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            ทีมไม่มีช่องเลือกภาษี — ระบบใช้กติกาตามฝั่งของทีมและประเภทผู้รับ · ผู้รับที่ตั้ง Tax Profile รายคนไว้จะใช้ค่ารายคนแทน
          </p>
        </>
      )}
    </section>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from '@/components/auth/permission-provider'
import { InlineAlert, Skeleton } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import { fmtPercent } from '@/lib/format/money'
import { emptyTaxProfileDefaults } from '@/lib/settings/tax-profile-defaults'
import type { TaxProfileDefaultsOverviewDto, WhtPolicyOverviewDto } from '@/lib/settings/types'
import type { TeamSide } from '@/lib/teams/team'
import {
  canOpenTaxProfileTab,
  TAX_PROFILE_TAB_PATH,
  teamTaxRuleLines,
  type TeamTaxRuleLine,
  type TeamTaxRuleProfile,
} from '@/lib/teams/team-tax-rule'

/**
 * กล่อง "กติกาภาษีของผู้รับในทีมนี้" บนฟอร์มทีม (มติ PO U161 · `09` §7) — **อ่านอย่างเดียว ไม่มีช่องเลือก**
 *
 * อ่านค่าตั้งจริงจาก `GET /api/settings/wht-policy` + `GET /api/settings/tax-profile-defaults`
 * (สิทธิ์ `view:view_master_data` เดียวกับหน้ารายการทีม) แล้วให้ `teamTaxRuleLines()` สรุปตามฝั่งของทีม
 * · ลิงก์ไปแท็บ Tax Profile แสดงเฉพาะผู้ที่เปิดแท็บนั้นได้ (`canOpenTaxProfileTab()`)
 */

interface TaxRuleData {
  policy: WhtPolicyOverviewDto['current']
  defaults: Parameters<typeof teamTaxRuleLines>[2]
}

function defaultsOf(overview: TaxProfileDefaultsOverviewDto): TaxRuleData['defaults'] {
  const slots = overview.current?.slots
  if (slots === undefined) return emptyTaxProfileDefaults<TeamTaxRuleProfile>()
  return slots
}

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
  const [data, setData] = useState<TaxRuleData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [policy, defaults] = await Promise.all([
        callApi<WhtPolicyOverviewDto>('/api/settings/wht-policy'),
        callApi<TaxProfileDefaultsOverviewDto>('/api/settings/tax-profile-defaults'),
      ])
      if (cancelled) return
      if (policy.error !== undefined || policy.data === undefined) {
        setError(policy.error?.message ?? 'โหลดค่าตั้งภาษีไม่สำเร็จ')
        return
      }
      if (defaults.error !== undefined || defaults.data === undefined) {
        setError(defaults.error?.message ?? 'โหลด Tax Profile ค่าเริ่มต้นไม่สำเร็จ')
        return
      }
      setData({ policy: policy.data.current, defaults: defaultsOf(defaults.data) })
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

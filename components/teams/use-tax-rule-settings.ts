'use client'

import { useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import { emptyTaxProfileDefaults, type TaxProfileDefaults } from '@/lib/settings/tax-profile-defaults'
import type { TaxProfileDefaultsOverviewDto, WhtPolicyOverviewDto } from '@/lib/settings/types'
import type { TeamTaxRuleProfile } from '@/lib/teams/team-tax-rule'

/**
 * โหลดค่าตั้งที่ `teamTaxRuleLines()` / `payeeDefaultTaxRule()` ต้องใช้ (มติ PO U161 · U164) — ใช้ร่วมฟอร์มทีม
 * และช่อง "กติกาภาษี (Tax Profile)" ของฟอร์มผู้ใช้/ผู้รับเงิน
 *
 * `GET /api/settings/wht-policy` + `GET /api/settings/tax-profile-defaults` (สิทธิ์ `view:view_master_data`
 * เดียวกับรายการ Tax Profile) · `data === null && error === null` = กำลังโหลด
 */

export interface TaxRuleSettings {
  policy: WhtPolicyOverviewDto['current']
  defaults: TaxProfileDefaults<TeamTaxRuleProfile>
}

function defaultsOf(overview: TaxProfileDefaultsOverviewDto): TaxProfileDefaults<TeamTaxRuleProfile> {
  return overview.current?.slots ?? emptyTaxProfileDefaults<TeamTaxRuleProfile>()
}

export function useTaxRuleSettings(): { data: TaxRuleSettings | null; error: string | null } {
  const [data, setData] = useState<TaxRuleSettings | null>(null)
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

  return { data, error }
}

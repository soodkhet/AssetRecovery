'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { CustodyTab } from '@/components/warehouse/custody-tab'
import { IntakeTab } from '@/components/warehouse/intake-tab'
import { EMPTY_TAB_COUNTS, WarehouseTabs, type WarehouseTabCounts } from '@/components/warehouse/warehouse-tabs'
import { apiPath } from '@/lib/api/contract'
import { callApi } from '@/lib/api/types'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import type { TeamDto } from '@/lib/teams/types'
import type { UserDto } from '@/lib/users/types'
import type { AssetTab } from '@/lib/warehouse/asset-status'
import { statusesOnWarehouseTab, type FilterOption } from '@/lib/warehouse/asset-filters'
import { statusesInLotTab } from '@/lib/warehouse/lot-status'
import type { AssetListDto, LotListDto } from '@/lib/warehouse/types'
import { ASSET_TAB_LABEL } from '@/lib/warehouse/warehouse-ui'

/**
 * หน้า "คลังสินค้า" (`/warehouse` — `44` §8 · `06` §7.1.1) — shell 4 แท็บ + badge counts
 *
 * - แท็บ 1–2 (รับเข้าคลัง / ในคลัง) = Phase 2.14 · แท็บ 3–4 (รอส่งมอบ / ส่งมอบแล้ว) = Phase 2.15
 * - badge นับตามตาราง §8.1: 2 แท็บแรกนับ **เครื่อง** (`asset.list`) · 2 แท็บหลังนับ **ล็อต** (`lot.list`)
 *   ทั้งคู่ยิงด้วย `limit=1` แล้วอ่าน `total` — ไม่ต้องมี endpoint นับใหม่ (แนวเดียวกับ KPI ของหน้ารับเคส)
 * - ตัวเลือก dropdown ทีม/พนักงาน/บริษัทมาจาก endpoint master data ซึ่ง **ธุรการคลังอาจไม่มีสิทธิ์เรียก**
 *   (`44` §13 ให้แค่ capability ของงานคลัง) ⇒ เรียกไม่ได้ก็ปล่อยว่างแล้วให้หน้าจอถอยไปใช้ค่าที่พบในแถว
 *   (`filterOptionsOrFallback()`)
 * - Company User เห็นทุกอย่างแบบอ่านอย่างเดียวโดยอัตโนมัติ: ปุ่ม action ผูกกับ capability และ scope
 *   ระดับแถวถูกบังคับที่ API (`assetScopeWhere()` — DEC-002)
 */
export function WarehouseManager() {
  const [tab, setTab] = useState<AssetTab>('intake')
  const [counts, setCounts] = useState<WarehouseTabCounts>(EMPTY_TAB_COUNTS)
  const [countsVersion, setCountsVersion] = useState(0)

  const [companies, setCompanies] = useState<readonly FilterOption[]>([])
  const [teams, setTeams] = useState<readonly FilterOption[]>([])
  const [agents, setAgents] = useState<readonly FilterOption[]>([])

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchCounts = useCallback(async (): Promise<WarehouseTabCounts> => {
    const [intake, custody, pendingHandover, handedOver] = await Promise.all([
      countAssets('intake'),
      countAssets('in_custody'),
      countLots('pending_handover'),
      countLots('handed_over'),
    ])
    return { intake, in_custody: custody, pending_handover: pendingHandover, handed_over: handedOver }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await fetchCounts()
      if (cancelled) return
      setCounts(next)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchCounts, countsVersion])

  // ตัวเลือกของ filter — โหลดครั้งเดียวตอนเข้าหน้า · ไม่มีสิทธิ์เรียก = ปล่อยว่าง (มี fallback ที่แท็บ)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [companyResult, teamResult, agentResult] = await Promise.all([
        callApi<FinanceCompanyDto[]>('/api/finance-companies?status=active'),
        callApi<TeamDto[]>('/api/teams?status=active'),
        callApi<UserDto[]>('/api/users?roleGroup=inhouse,outsource&status=active'),
      ])
      if (cancelled) return
      setCompanies((companyResult.data ?? []).map((company) => ({ id: company.id, name: company.name })))
      setTeams((teamResult.data ?? []).map((team) => ({ id: team.id, name: team.name })))
      setAgents((agentResult.data ?? []).map((agent) => ({ id: agent.id, name: agent.fullName })))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refreshCounts = useCallback(() => setCountsVersion((current) => current + 1), [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="คลังสินค้า"
        description="รับเครื่องเข้าคลัง จัดล็อตส่งมอบ และยืนยันส่งมอบคืนบริษัทไฟแนนซ์ (ไฟล์ 44)"
      />

      <WarehouseTabs tab={tab} counts={counts} onTabChange={setTab} />

      {tab === 'intake' && (
        <IntakeTab companies={companies} teams={teams} agents={agents} onChanged={refreshCounts} />
      )}
      {tab === 'in_custody' && <CustodyTab companies={companies} onChanged={refreshCounts} />}
      {(tab === 'pending_handover' || tab === 'handed_over') && (
        <Card>
          <EmptyState
            title={`แท็บ “${ASSET_TAB_LABEL[tab]}” กำลังจะมา`}
            description="หน้าจอล็อตส่งมอบ (นัดวันส่งมอบ / แนบเอกสาร / ยืนยันส่งมอบ) เปิดใช้งานใน Phase 2.15"
          />
        </Card>
      )}
    </div>
  )
}

/** นับเครื่องของแท็บ — `limit=1` แล้วอ่าน `total` · เรียกไม่ได้ = `null` (ซ่อน badge ไม่ใช่แสดง 0) */
async function countAssets(tab: AssetTab): Promise<number | null> {
  const response = await callApi<AssetListDto>(
    apiPath('asset.list', undefined, { status: statusesOnWarehouseTab(tab).join(','), page: 1, limit: 1 }),
  )
  return response.data?.total ?? null
}

/** นับล็อตของแท็บ (`44` §8.1 — 2 แท็บหลังนับล็อตไม่ใช่เครื่อง) */
async function countLots(tab: 'pending_handover' | 'handed_over'): Promise<number | null> {
  const response = await callApi<LotListDto>(
    apiPath('lot.list', undefined, { status: statusesInLotTab(tab).join(','), page: 1, limit: 1 }),
  )
  return response.data?.total ?? null
}

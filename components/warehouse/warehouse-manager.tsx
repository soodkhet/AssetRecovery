'use client'

import { pickParam, replaceUrlParams } from '@/components/ui/url-state'
import { useSearchParamChange } from '@/components/ui/use-search-param-change'
import { useCallback, useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { PageHeader } from '@/components/ui'
import { CustodyTab } from '@/components/warehouse/custody-tab'
import { HandoverLotModal } from '@/components/warehouse/handover-lot-modal'
import { IntakeTab } from '@/components/warehouse/intake-tab'
import { LotTab } from '@/components/warehouse/lot-tab'
import { EMPTY_TAB_COUNTS, WarehouseTabs, type WarehouseTabCounts } from '@/components/warehouse/warehouse-tabs'
import { apiPath } from '@/lib/api/contract'
import { callApi } from '@/lib/api/types'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import type { TeamDto } from '@/lib/teams/types'
import type { UserDto } from '@/lib/users/types'
import { ASSET_TABS, type AssetTab } from '@/lib/warehouse/asset-status'
import { statusesOnWarehouseTab, type FilterOption } from '@/lib/warehouse/asset-filters'
import { statusesInLotTab } from '@/lib/warehouse/lot-status'
import type { AssetListDto, AssetListItemDto, LotListDto } from '@/lib/warehouse/types'

/**
 * หน้า "คลังสินค้า" (`/warehouse` — `44` §8 · `06` §7.1.1) — shell 4 แท็บ + badge counts
 *
 * - แท็บ 1–2 (รับเข้าคลัง / ในคลัง) = Phase 2.14 · แท็บ 3–4 (รอส่งมอบ / ส่งมอบแล้ว) = Phase 2.15 (`<LotTab>`)
 * - วงจรครบที่นี่: ติ๊กเครื่องในแท็บ "ในคลัง" → `<HandoverLotModal>` สร้างล็อต → เด้งไปแท็บของล็อตที่เกิด
 *   (`tab` ของ DTO ตาม §9.3 — `we_deliver` ไป "ส่งมอบแล้ว" ทันที) → แนบเอกสาร → ยืนยัน
 * - badge นับตามตาราง §8.1: 2 แท็บแรกนับ **เครื่อง** (`asset.list`) · 2 แท็บหลังนับ **ล็อต** (`lot.list`)
 *   ทั้งคู่ยิงด้วย `limit=1` แล้วอ่าน `total` — ไม่ต้องมี endpoint นับใหม่ (แนวเดียวกับ KPI ของหน้ารับเคส)
 * - ตัวเลือก dropdown ทีม/พนักงาน/บริษัทมาจาก endpoint master data ซึ่ง **หลาย role ที่เข้าหน้าคลังได้ไม่มีสิทธิ์เรียก**
 *   (`44` §13 ให้แค่ capability ของงานคลัง) ⇒ **เรียกเฉพาะ endpoint ที่ผู้ใช้มีสิทธิ์** (ไม่ยิงแล้วโดน 403 —
 *   UAT BUG-081) · ผู้ใช้ฝั่งบริษัทไม่เรียกเลย (เห็นแค่บริษัทตัวเอง) · ที่ไม่ได้โหลดให้หน้าจอถอยไปใช้ค่าที่พบในแถว
 *   (`filterOptionsOrFallback()`)
 * - Company User เห็นทุกอย่างแบบอ่านอย่างเดียวโดยอัตโนมัติ: ปุ่ม action ผูกกับ capability และ scope
 *   ระดับแถวถูกบังคับที่ API (`assetScopeWhere()` — DEC-002)
 */
export function WarehouseManager({ initialTab = 'intake' }: { initialTab?: AssetTab }) {
  const { session, can } = usePermission()
  const isCompanyViewer = session?.scope.kind === 'company'
  // endpoint ↔ capability: `/api/finance-companies` + `/api/teams` = view_master_data · `/api/users` = manage_users (view)
  const canLoadMasterData = !isCompanyViewer && can('view', 'view_master_data')
  const canLoadUsers = !isCompanyViewer && can('view', 'manage_users')
  const [tab, setTab] = useState<AssetTab>(initialTab)
  // แท็บอยู่ใน URL — refresh/Back กลับมาที่แท็บเดิม (preship PS-013)
  useEffect(() => {
    replaceUrlParams({ tab })
  }, [tab])
  // นำทางมา route เดิมด้วย `?tab=` ใหม่ (เช่น กดแจ้งเตือน) — หน้าจอต้องตาม URL (preship R2-009) · กติกาเดียวกับ page
  useSearchParamChange('tab', (value) => setTab(pickParam(value ?? undefined, ASSET_TABS, 'intake')))
  const [counts, setCounts] = useState<WarehouseTabCounts>(EMPTY_TAB_COUNTS)
  const [countsVersion, setCountsVersion] = useState(0)

  const [companies, setCompanies] = useState<readonly FilterOption[]>([])
  const [teams, setTeams] = useState<readonly FilterOption[]>([])
  const [agents, setAgents] = useState<readonly FilterOption[]>([])
  /** ที่อยู่บริษัท (master data) — เติมช่อง "ที่อยู่จัดส่ง" ให้อัตโนมัติเมื่อเลือก `we_deliver` */
  const [companyAddresses, setCompanyAddresses] = useState<Readonly<Record<string, string | null>>>({})

  /** เครื่องที่ติ๊กมาจากแท็บ "ในคลัง" เพื่อเปิด modal นัดวันส่งมอบ (`null` = ยังไม่เปิด) */
  const [scheduling, setScheduling] = useState<{ companyId: string; assets: readonly AssetListItemDto[] } | null>(null)
  const [custodyVersion, setCustodyVersion] = useState(0)

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
        canLoadMasterData
          ? callApi<FinanceCompanyDto[]>('/api/finance-companies?status=active')
          : Promise.resolve({ data: undefined }),
        canLoadMasterData ? callApi<TeamDto[]>('/api/teams?status=active') : Promise.resolve({ data: undefined }),
        canLoadUsers
          ? callApi<UserDto[]>('/api/users?roleGroup=inhouse,outsource&status=active')
          : Promise.resolve({ data: undefined }),
      ])
      if (cancelled) return
      setCompanies((companyResult.data ?? []).map((company) => ({ id: company.id, name: company.name })))
      setCompanyAddresses(
        Object.fromEntries((companyResult.data ?? []).map((company) => [company.id, company.address])),
      )
      setTeams((teamResult.data ?? []).map((team) => ({ id: team.id, name: team.name })))
      setAgents((agentResult.data ?? []).map((agent) => ({ id: agent.id, name: agent.fullName })))
    })()
    return () => {
      cancelled = true
    }
  }, [canLoadMasterData, canLoadUsers])

  const refreshCounts = useCallback(() => setCountsVersion((current) => current + 1), [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="คลังสินค้า"
        description="รับเครื่องเข้าคลัง จัดล็อตส่งมอบ และยืนยันส่งมอบคืนบริษัทไฟแนนซ์"
      />

      <WarehouseTabs tab={tab} counts={counts} onTabChange={setTab} />

      {tab === 'intake' && (
        <IntakeTab companies={companies} teams={teams} agents={agents} onChanged={refreshCounts} />
      )}
      {tab === 'in_custody' && (
        <CustodyTab
          companies={companies}
          reloadToken={custodyVersion}
          onScheduleHandover={(companyId, assets) => setScheduling({ companyId, assets })}
        />
      )}
      {(tab === 'pending_handover' || tab === 'handed_over') && (
        // key ตามแท็บ — สลับ "รอส่งมอบ" ↔ "ส่งมอบแล้ว" ต้องปิดล็อตที่เปิดค้าง/ล้างตัวกรองของอีกแท็บ (state ไม่ติดข้ามแท็บ)
        <LotTab key={tab} tab={tab} companies={companies} onChanged={refreshCounts} />
      )}

      {scheduling !== null && (
        <HandoverLotModal
          key={scheduling.assets.map((asset) => asset.id).join('|')}
          open
          companyId={scheduling.companyId}
          assets={scheduling.assets}
          defaultDeliveryAddr={companyAddresses[scheduling.companyId] ?? null}
          onClose={() => setScheduling(null)}
          onCreated={(lot) => {
            // เครื่องที่เลือกกลายเป็น `handover_pending` แล้ว ⇒ รีเฟรชแท็บในคลัง + badge
            setScheduling(null)
            setCustodyVersion((current) => current + 1)
            refreshCounts()
            setTab(lot.tab) // `44` §9.3 — `we_deliver` เด้งไป "ส่งมอบแล้ว" ทันที
          }}
        />
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

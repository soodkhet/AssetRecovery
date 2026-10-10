'use client'

import { PortalArAgingCard, PortalRevenueSummaryCard } from '@/components/portal/portal-finance-cards'
import { PortalKpiCard } from '@/components/portal/portal-kpi-card'
import { usePortalData } from '@/components/portal/use-portal-data'
import { Card, EmptyState, InlineAlert, LoadingState, PageHeader } from '@/components/ui'
import type { PortalSection } from '@/lib/portal/access'
import { portalKpiCards, portalOverviewLoads } from '@/lib/portal/nav'
import type { PortalArAgingDto, PortalDashboardDto, PortalRevenueSummaryDto } from '@/lib/portal/serializers'
import { PortalErrorState } from '@/components/portal/portal-error-state'

/**
 * หน้าภาพรวมของพอร์ทัล (`97` §5 KPI 4 ใบ + §6.5 แนวโน้ม 6 เดือน + AR Aging — v3 รวมรายงานไว้หน้าเดียว)
 *
 * - KPI จาก `GET /api/portal/dashboard` — แสดงเฉพาะการ์ดที่ API ส่งคีย์มา (หมวดที่ไม่มีสิทธิ์ไม่มีคีย์)
 * - รายงานการเงินยิงเฉพาะผู้มีหมวดการเงิน — หัวหน้า/แอดมินบริษัทไม่เห็นและไม่ยิง request
 * - ไม่มีข้อมูลตัวอย่าง: ทุกตัวเลขมาจาก API (คำนวณสดฝั่ง server)
 */
export function PortalOverview({
  companyName,
  sections,
  deniedMessage = null,
}: {
  companyName: string
  sections: readonly PortalSection[]
  /** staging E-072 — เด้งมาจากหมวดที่ไม่มีสิทธิ์ */
  deniedMessage?: string | null
}) {
  const loads = portalOverviewLoads(sections)
  const dashboard = usePortalData<PortalDashboardDto>('/api/portal/dashboard', loads.dashboard)
  const revenue = usePortalData<PortalRevenueSummaryDto>('/api/portal/reports/revenue-summary?months=6', loads.financeReports)
  const aging = usePortalData<PortalArAgingDto>('/api/portal/reports/ar-aging', loads.financeReports)

  return (
    <div>
      <PageHeader title="ภาพรวม" description={`สรุปสถานะล่าสุดของ ${companyName}`} />

      {deniedMessage !== null && (
        <div className="mb-4">
          <InlineAlert tone="warning" title="ไม่มีสิทธิ์ดูหมวดนี้">
            {deniedMessage}
          </InlineAlert>
        </div>
      )}

      {!loads.dashboard && !loads.financeReports ? (
        <Card padded={false}>
          <EmptyState
            title="ยังไม่มีข้อมูลสรุปที่ท่านเข้าถึงได้"
            description="หากต้องการดูข้อมูลเพิ่มเติม กรุณาติดต่อเจ้าหน้าที่ AssetRecovery"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {loads.dashboard && <PortalKpiSection state={dashboard} />}
          {loads.financeReports && (
            <>
              <PortalRevenueSummaryCard state={revenue} />
              <PortalArAgingCard state={aging} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PortalKpiSection({ state }: { state: ReturnType<typeof usePortalData<PortalDashboardDto>> }) {
  if (state.loading) {
    return (
      <Card padded={false}>
        <LoadingState />
      </Card>
    )
  }
  if (state.error !== null) {
    return (
      <Card padded={false}>
        <PortalErrorState error={state.error} onRetry={state.reload} />
      </Card>
    )
  }
  const cards = state.data === null ? [] : portalKpiCards(state.data)
  if (cards.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState title="ยังไม่มีข้อมูลสรุป" />
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {cards.map((card) => (
        <PortalKpiCard key={card.key} card={card} />
      ))}
    </div>
  )
}

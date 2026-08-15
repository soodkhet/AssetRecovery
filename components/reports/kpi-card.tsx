'use client'

import { StatCard } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { momLabel, momToneClass } from '@/lib/reports/kpi'
import { formatCellText, type ReportKpi } from '@/lib/reports/payload'

/**
 * KPI card + badge เทียบงวดก่อน (`96` §11 "KPI cards มีเปรียบเทียบกับเดือนก่อน (MoM %) แสดงเป็น ↑↓ badge")
 *
 * ค่าและทิศทางมาจาก backend ทั้งหมด (`ReportKpi`) — หน้าจอไม่คำนวณ % เอง (Rule 01)
 */
export function KpiCard({ kpi }: { kpi: ReportKpi }) {
  const higherIsBetter = kpi.higherIsBetter ?? true

  return (
    <StatCard
      label={kpi.label}
      value={formatCellText(kpi.value, kpi.type)}
      hint={
        kpi.mom === undefined ? (
          kpi.hint
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            <span className={cn('font-semibold', momToneClass(kpi.mom, higherIsBetter))}>{momLabel(kpi.mom)}</span>
            <span className="text-slate-400">เทียบงวดก่อน</span>
            {kpi.hint !== undefined && <span className="text-slate-400">· {kpi.hint}</span>}
          </span>
        )
      }
    />
  )
}

export function KpiCardRow({ kpis }: { kpis: readonly ReportKpi[] }) {
  if (kpis.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  )
}

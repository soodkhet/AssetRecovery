'use client'

import { useState } from 'react'
import { ProfitDrilldownModal } from '@/components/finance/profit-drilldown-modal'
import { useProfitability } from '@/components/finance/use-reports'
import {
  Button,
  StatCard,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtRatioPct, fmtSatangSymbol } from '@/lib/format/money'
import type { ReportPeriodType } from '@/lib/reports/period'
import type { ProfitDimension } from '@/lib/reports/profitability'
import {
  PROFIT_DIMENSION_OPTIONS,
  PROFIT_PERIOD_OPTIONS,
  freshnessLabel,
  grossProfitToneClass,
  marginToneClass,
} from '@/lib/reports/profit-ui'

/**
 * แท็บ "กำไรและต้นทุน" (`21` §8 · mockup `finance.html` แท็บ `profit`)
 * — KPI 4 การ์ด + ตารางตามมิติ (บริษัท/ทีม) + ปุ่มเจาะลึก
 *
 * ⚠️ **read-only ทั้งแท็บ** (`21` §10) — ไม่มีปุ่มแก้ไขข้อมูลใด ๆ โดยตั้งใจ
 * ⚠️ ยอดเงิน/margin คำนวณที่ backend (`22` §6.12) — หน้าจอแค่ format · `marginPct = null` ⇒ `N/A`
 * ⚠️ เคส `closed_fail` ที่มีต้นทุนแต่ไม่มีรายได้ **ต้องปรากฏในตาราง** (`21` §6.1) ห้ามกรองแถวออกที่นี่
 */
export function ProfitTab() {
  const [dimension, setDimension] = useState<ProfitDimension>('company')
  const [period, setPeriod] = useState<ReportPeriodType>('month')
  const [drilldown, setDrilldown] = useState<{ key: string; label: string } | null>(null)

  const { data, loading, error, reload } = useProfitability(dimension, period)
  const dimensionLabel = dimension === 'company' ? 'บริษัทไฟแนนซ์' : 'ทีม'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">รายงานกำไรขั้นต้น (Gross Profit)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ผลจริงที่เกิดขึ้นแล้ว (actual) ไม่ใช่ประมาณการ — เคสที่ปิดไม่สำเร็จแต่มีต้นทุน กด Margin ลงจริง
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {PROFIT_DIMENSION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDimension(option.id)}
                className={cn(
                  'focus-ring rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                  dimension === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {PROFIT_PERIOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPeriod(option.id)}
                className={cn(
                  'focus-ring rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                  period === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Button variant="secondary" loading={loading} onClick={() => void reload(true)}>
            รีเฟรชตอนนี้
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="รายได้ (Revenue)"
          value={fmtSatangSymbol(data.total.revenueSatang)}
          hint={`${data.periodLabel === '' ? '—' : data.periodLabel} · ยอดก่อน VAT`}
          className="border-emerald-200 bg-emerald-50"
        />
        <StatCard
          label="ต้นทุนตรง (Direct Cost)"
          value={fmtSatangSymbol(data.total.directCostSatang)}
          hint="ค่าน้ำมัน + เบี้ยเลี้ยง + ค่าตอบแทนเคส"
          className="border-amber-200 bg-amber-50"
        />
        <StatCard
          label="กำไรขั้นต้น (Gross Profit)"
          value={fmtSatangSymbol(data.total.grossProfitSatang)}
          hint="Revenue − Direct Cost"
          className="border-blue-200 bg-blue-50"
        />
        <StatCard
          label="Gross Margin"
          value={<span className={marginToneClass(data.total.marginPct)}>{fmtRatioPct(data.total.marginPct)}</span>}
          hint="กำไร ÷ รายได้ × 100"
        />
      </div>

      <p className="text-[11px] text-slate-400">
        {freshnessLabel(data.fromCache)}
        {data.computedAt === '' ? '' : ` · ข้อมูล ณ ${fmtDateTime(data.computedAt)}`}
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>มิติ ({dimensionLabel})</Th>
              <Th numeric>รายได้</Th>
              <Th numeric>ต้นทุนตรง</Th>
              <Th numeric>กำไรขั้นต้น</Th>
              <Th numeric>Margin %</Th>
              <Th className="text-right">เจาะลึก</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.rows.length === 0}
            emptyTitle="ยังไม่มีข้อมูลในช่วงเวลานี้"
            emptyDescription="ยังไม่มีรายได้หรือต้นทุนตรงที่เกิดขึ้นจริงในช่วงเวลาที่เลือก"
            colSpan={6}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.rows.map((row) => (
                <Tr key={row.key}>
                  <Td className="font-semibold text-slate-900">
                    {row.label}
                    <span className="ml-2 text-[10px] font-normal text-slate-400">
                      รายได้ {fmtCount(row.revenueCaseCount)} เคส · ต้นทุน {fmtCount(row.costCaseCount)} เคส
                    </span>
                  </Td>
                  <Td numeric>{fmtSatangSymbol(row.revenueSatang)}</Td>
                  <Td numeric className="text-amber-700">
                    {fmtSatangSymbol(row.directCostSatang)}
                  </Td>
                  <Td numeric className={cn('font-bold', grossProfitToneClass(row.grossProfitSatang))}>
                    {fmtSatangSymbol(row.grossProfitSatang)}
                  </Td>
                  <Td numeric className={cn('font-bold', marginToneClass(row.marginPct))}>
                    {fmtRatioPct(row.marginPct)}
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" onClick={() => setDrilldown({ key: row.key, label: row.label })}>
                      เจาะลึก
                    </Button>
                  </Td>
                </Tr>
              ))}
            {!loading && error === null && data.rows.length > 0 && (
              <Tr className="bg-slate-50">
                <Td className="font-bold text-slate-900">รวมทั้งหมด</Td>
                <Td numeric className="font-bold">
                  {fmtSatangSymbol(data.total.revenueSatang)}
                </Td>
                <Td numeric className="font-bold text-amber-700">
                  {fmtSatangSymbol(data.total.directCostSatang)}
                </Td>
                <Td numeric className={cn('font-bold', grossProfitToneClass(data.total.grossProfitSatang))}>
                  {fmtSatangSymbol(data.total.grossProfitSatang)}
                </Td>
                <Td numeric className={cn('font-bold', marginToneClass(data.total.marginPct))}>
                  {fmtRatioPct(data.total.marginPct)}
                </Td>
                <Td />
              </Tr>
            )}
          </TBody>
        </Table>
      </div>

      <ProfitDrilldownModal
        key={drilldown?.key ?? 'none'}
        target={drilldown}
        dimension={dimension}
        period={period}
        onClose={() => setDrilldown(null)}
      />
    </div>
  )
}

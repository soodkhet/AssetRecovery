'use client'

import { useCallback, useState } from 'react'
import { ReportBarChart } from '@/components/reports/report-bar-chart'
import { ReportLineChart } from '@/components/reports/report-line-chart'
import { ReportView } from '@/components/reports/report-view'
import { useReportData } from '@/components/reports/use-report-data'
import type { ReportRangeValue } from '@/components/reports/date-range-picker'
import type { ReportDefinition } from '@/lib/reports/catalog'
import type { ReportRow } from '@/lib/reports/payload'

/**
 * หน้าจอของ **Executive Dashboard** (`96` §6-E) — ห่อ `<ReportView>` เหมือนหมวด F/O/A
 * (ตาราง / KPI / ปุ่มส่งออก / แคช / ป้าย "ข้อมูล ณ …" เป็นของโครงกลาง 6.1 ห้ามทำใหม่)
 *
 * - **E1** เป็นหน้าเดียวที่มีของเฉพาะตัว: ช่วงเวลาเริ่มต้นเป็น **"ปีนี้"** (= YTD ตามเอกสาร) +
 *   กราฟ 3 ตัวของ §6-E1 — เส้นรายได้ / เส้น % สำเร็จ (อ่านจากแถวเทรนด์ 12 เดือนของ payload ตัวเอง)
 *   และแท่ง **Top 5 บริษัทไฟแนนซ์ตามรายได้**
 * - **E2/E3** เป็นตารางล้วนตามเอกสาร ⇒ ใช้ `<ReportView>` ตรง ๆ ไม่ต้องลงทะเบียนหน้าจอ
 *
 * ⚠️ กราฟ Top 5 อ่านจาก payload ของ **E2 (Scorecard รายบริษัท)** ไม่ได้คำนวณเองซ้ำ — เป็นรายงาน
 * หมวดเดียวกัน (สิทธิ์ชุดเดียวกัน) และแคชรายวันเหมือนกัน ⇒ ตัวเลขบนกราฟกับหน้า E2 ตรงกันเสมอ
 */

type ScreenProps = { report: Pick<ReportDefinition, 'id' | 'code' | 'title'> }

/** ค่าเริ่มต้นของ E1 = ทั้งปีปัจจุบัน (`96` §6-E1 พูดถึง Revenue/Gross Profit **YTD**) */
const INITIAL_RANGE: ReportRangeValue = { preset: 'this_year', from: '', to: '' }

const TOP_COMPANY_COUNT = 5

export function KpiSummaryScreen({ report }: ScreenProps) {
  const [range, setRange] = useState<ReportRangeValue>(INITIAL_RANGE)

  const renderCharts = useCallback(
    ({ payload }: { payload: { rows: readonly ReportRow[] } | null }) =>
      payload === null || payload.rows.length === 0 ? null : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReportLineChart
              title={`รายได้รายเดือน (${payload.rows.length} เดือนย้อนหลัง)`}
              rows={payload.rows}
              labelKey="month"
              valueKey="revenueSatang"
            />
            <ReportLineChart
              title="% สำเร็จรายเดือน"
              rows={payload.rows}
              labelKey="month"
              valueKey="successPct"
              valueType="percent"
              emptyDescription="ยังไม่มีเคสที่ปิดในช่วงนี้"
            />
          </div>
          <TopCompaniesChart range={range} />
        </div>
      ),
    [range],
  )

  return (
    <ReportView report={report} initialRange={INITIAL_RANGE} onRangeChange={setRange} chart={renderCharts} />
  )
}

/**
 * Top 5 บริษัทไฟแนนซ์ตามรายได้ (`96` §6-E1) — หยิบ 5 แถวแรกของ E2 ซึ่งเรียงตามรายได้มาแล้ว
 * (บริษัทที่ไม่มีรายได้ในช่วงนั้นไม่ขึ้นกราฟ — แท่งศูนย์ไม่ได้บอกอะไร)
 */
function TopCompaniesChart({ range }: { range: ReportRangeValue }) {
  const { payload } = useReportData('company-scorecard', range)
  if (payload === null) return null

  const rows = payload.rows
    .filter((row) => typeof row['revenueSatang'] === 'number' && row['revenueSatang'] > 0)
    .slice(0, TOP_COMPANY_COUNT)
  if (rows.length === 0) return null

  return (
    <ReportBarChart
      title={`Top ${TOP_COMPANY_COUNT} บริษัทไฟแนนซ์ตามรายได้`}
      rows={rows}
      labelKey="company"
      valueKey="revenueSatang"
    />
  )
}

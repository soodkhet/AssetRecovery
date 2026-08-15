'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Field, FilterGroup, Select } from '@/components/ui'
import { ReportBarChart } from '@/components/reports/report-bar-chart'
import { ReportView, type ReportSlotContext } from '@/components/reports/report-view'
import type { ReportDefinition } from '@/lib/reports/catalog'
import {
  COMPENSATION_GROUP_BYS,
  COMPENSATION_GROUP_BY_LABEL,
  type CompensationGroupBy,
} from '@/lib/reports/finance/compensation-report'
import {
  REVENUE_GROUP_BYS,
  REVENUE_GROUP_BY_LABEL,
  type RevenueGroupBy,
} from '@/lib/reports/finance/revenue-summary-report'
import { ROW_KEY, type ReportPayload } from '@/lib/reports/payload'
import { PROFIT_DIMENSIONS, PROFIT_DIMENSION_LABEL, type ProfitDimension } from '@/lib/reports/profitability'

/**
 * หน้าจอของรายงานหมวด F (`96` §6-F) — **ทุกตัวห่อ `<ReportView>`**
 * (ตาราง / ปุ่มส่งออก / ตัวโหลดข้อมูล / แคช เป็นของโครงกลาง 6.1 ห้ามทำใหม่)
 *
 * สิ่งที่แต่ละหน้าทำเองมีแค่ **ตัวกรองเฉพาะรายงาน** (พารามิเตอร์ตาม `96` §9) และกราฟ:
 * - F1 `?dimension=company|team` + drill-down รายเคส (`?dimensionId=`)
 * - F2 `?groupBy=month|quarter|company` + กราฟแท่งรายเดือน
 * - F4 `?groupBy=team|employee`
 * - F3/F5 ไม่มีพารามิเตอร์ (เป็นรายงาน ณ วันที่) ⇒ ใช้ `<ReportView>` ตรง ๆ
 */

type ScreenProps = { report: Pick<ReportDefinition, 'id' | 'code' | 'title'> }

const PROFIT_DIMENSION_OPTIONS = PROFIT_DIMENSIONS.map((value) => ({
  value,
  label: PROFIT_DIMENSION_LABEL[value],
}))

const REVENUE_GROUP_OPTIONS = REVENUE_GROUP_BYS.map((value) => ({
  value,
  label: REVENUE_GROUP_BY_LABEL[value],
}))

const COMPENSATION_GROUP_OPTIONS = COMPENSATION_GROUP_BYS.map((value) => ({
  value,
  label: COMPENSATION_GROUP_BY_LABEL[value],
}))

interface DrilldownOption {
  value: string
  label: string
}

/** ตัวเลือก drill-down ของ F1 — อ่านจาก payload ที่ตารางใช้อยู่ (คีย์เทคนิค `__key` ไม่ใช่ชื่อที่แสดง) */
function drilldownOptions(payload: ReportPayload | null): DrilldownOption[] {
  if (payload === null) return []
  return payload.rows
    .map((row) => ({ value: String(row[ROW_KEY] ?? ''), label: String(row['dimension'] ?? '') }))
    .filter((option) => option.value !== '')
}

// ── F1 — กำไรขั้นต้น ────────────────────────────────────────────────────────

export function GrossProfitScreen({ report }: ScreenProps) {
  const [dimension, setDimension] = useState<ProfitDimension>('company')
  const [dimensionId, setDimensionId] = useState('')
  /** ตัวเลือกล่าสุดตอนอยู่หน้าสรุป — ตอน drill-down payload เป็นรายเคสแล้วจึงต้องจำไว้ */
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])

  const params = useMemo<Readonly<Record<string, string>>>(() => {
    const query: Record<string, string> = { dimension }
    if (dimensionId !== '') query['dimensionId'] = dimensionId
    return query
  }, [dimension, dimensionId])

  const changeDimension = useCallback((next: ProfitDimension) => {
    setDimension(next)
    // มิติคนละชุด ⇒ id เดิมใช้ไม่ได้ กลับไปหน้าสรุปก่อนเสมอ
    setDimensionId('')
    setOptions([])
  }, [])

  const renderFilters = useCallback(
    ({ payload, loading }: ReportSlotContext) => (
      <GrossProfitFilters
        dimension={dimension}
        dimensionId={dimensionId}
        options={options}
        payload={payload}
        loading={loading}
        onDimensionChange={changeDimension}
        onDimensionIdChange={setDimensionId}
        onOptionsChange={setOptions}
      />
    ),
    [changeDimension, dimension, dimensionId, options],
  )

  return (
    <ReportView
      report={report}
      params={params}
      filters={renderFilters}
      onRangeChange={() => {
        // ช่วงเวลาใหม่ = ชุดมิติใหม่ ⇒ กลับหน้าสรุปเพื่อให้ตัวเลือกตรงกับข้อมูลจริงเสมอ
        setDimensionId('')
        setOptions([])
      }}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title={dimensionId === '' ? `กำไรขั้นต้นแยกตาม${PROFIT_DIMENSION_LABEL[dimension]}` : 'กำไรขั้นต้นรายเคส'}
            rows={payload.rows}
            labelKey={dimensionId === '' ? 'dimension' : 'caseRef'}
            valueKey="grossProfitSatang"
          />
        )
      }
    />
  )
}

/**
 * ตัวกรองของ F1 — แยกเป็นคอมโพเนนต์เพราะต้อง "ยก" รายชื่อมิติขึ้นไปเก็บที่หน้าหลัก
 * (ตอน drill-down payload กลายเป็นรายเคสแล้ว) — ยกผ่าน `useEffect` เท่านั้น **ห้าม setState
 * ระหว่าง render** ของคอมโพเนนต์อื่น
 */
function GrossProfitFilters({
  dimension,
  dimensionId,
  options,
  payload,
  loading,
  onDimensionChange,
  onDimensionIdChange,
  onOptionsChange,
}: {
  dimension: ProfitDimension
  dimensionId: string
  options: readonly DrilldownOption[]
  payload: ReportPayload | null
  loading: boolean
  onDimensionChange: (next: ProfitDimension) => void
  onDimensionIdChange: (next: string) => void
  onOptionsChange: (next: DrilldownOption[]) => void
}) {
  const isSummary = dimensionId === ''
  const fromPayload = useMemo(() => (isSummary ? drilldownOptions(payload) : []), [isSummary, payload])
  const fingerprint = fromPayload.map((option) => option.value).join(',')

  useEffect(() => {
    if (!isSummary) return
    onOptionsChange(fromPayload)
    // `fingerprint` แทน array เพื่อไม่ให้ลูปจากการสร้าง array ใหม่ทุกรอบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, isSummary])

  const current = isSummary ? fromPayload : options

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterGroup options={PROFIT_DIMENSION_OPTIONS} value={dimension} onChange={onDimensionChange} />
      <Field id="gross-profit-drilldown" label="ดูรายละเอียดรายเคสของ" hint="เลือกเพื่อเจาะลึกรายเคสในมิตินั้น">
        <Select
          id="gross-profit-drilldown"
          value={dimensionId}
          disabled={loading || current.length === 0}
          onChange={(event) => onDimensionIdChange(event.target.value)}
        >
          <option value="">— ดูภาพรวมทุก{PROFIT_DIMENSION_LABEL[dimension]} —</option>
          {current.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

// ── F2 — สรุปรายได้ ─────────────────────────────────────────────────────────

export function RevenueSummaryScreen({ report }: ScreenProps) {
  const [groupBy, setGroupBy] = useState<RevenueGroupBy>('month')
  const params = useMemo(() => ({ groupBy }), [groupBy])

  return (
    <ReportView
      report={report}
      params={params}
      filters={<FilterGroup options={REVENUE_GROUP_OPTIONS} value={groupBy} onChange={setGroupBy} />}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title={`รายได้${REVENUE_GROUP_BY_LABEL[groupBy]}`}
            rows={payload.rows}
            labelKey="group"
            valueKey="revenueSatang"
          />
        )
      }
    />
  )
}

// ── F4 — สรุปค่าตอบแทน ──────────────────────────────────────────────────────

export function CompensationScreen({ report }: ScreenProps) {
  const [groupBy, setGroupBy] = useState<CompensationGroupBy>('team')
  const params = useMemo(() => ({ groupBy }), [groupBy])

  return (
    <ReportView
      report={report}
      params={params}
      filters={<FilterGroup options={COMPENSATION_GROUP_OPTIONS} value={groupBy} onChange={setGroupBy} />}
    />
  )
}

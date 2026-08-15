import { grossProfit, summarizeGrossProfit, type GrossProfit } from '@/lib/finance/gross-profit'
import { momComparison } from '@/lib/reports/kpi'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import {
  PROFIT_DIMENSION_LABEL,
  type ProfitDimension,
  type ProfitabilityBreakdown,
} from '@/lib/reports/profitability'

/**
 * **F1 — กำไรขั้นต้น** (`96` §6-F1) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * รายงานตัวนี้ "ย้ายมาอยู่ในเมนูรายงาน" ของไฟล์ 96 แต่ตัวเลขยังเป็นของ **ไฟล์ 21** ทุกประการ
 * ⇒ ที่นี่ไม่มีสูตรใหม่แม้แต่บรรทัดเดียว: รับผลของ `summarizeProfitability()` (3.8) ซึ่งต่อยอด
 * `grossProfit()` (`22` §6.12) มาแล้ว แล้วแปลงเป็น `columns`/`rows` ของสัญญากลาง `96` §13
 *
 * ### กติกาที่ห้ามหลุด
 * - **มิติที่มีแต่ต้นทุนต้องอยู่ในตาราง** (เคส `closed_fail`) — ตัวสรุปจัดการให้แล้ว ห้ามกรองซ้ำที่นี่
 * - `revenue = 0` ⇒ `marginPct = null` แสดง **"N/A"** ไม่ใช่ 0% (Rule 01 — ห้ามหารศูนย์)
 * - MoM ของ KPI เทียบกับ**ช่วงก่อนหน้าที่ยาวเท่ากัน** (`previousReportRange()`) — งวดก่อนเป็น 0
 *   ⇒ `changePct = null` แสดง "N/A"
 * - **ต้นทุนที่มากขึ้นไม่ใช่เรื่องดี** ⇒ KPI ต้นทุนตรงต้อง `higherIsBetter: false`
 */

const SUMMARY_NOTE =
  'นับเฉพาะรายได้ที่เกิดจริง (ไฟล์ 19) และต้นทุนตรงที่อนุมัติแล้ว 4 ชนิดตาม `22` §6.12 — ' +
  'เคสที่ปิดไม่สำเร็จแต่มีต้นทุนถูกนับด้วยเสมอ · ทุกยอดเป็นยอดหลังรายการปรับปรุงที่อนุมัติแล้ว'

function summaryColumns(dimension: ProfitDimension): readonly ReportColumn[] {
  return [
    { key: 'dimension', header: PROFIT_DIMENSION_LABEL[dimension], type: 'text', width: 28 },
    { key: 'revenueSatang', header: 'รายได้', type: 'money' },
    { key: 'directCostSatang', header: 'ต้นทุนตรง', type: 'money' },
    { key: 'grossProfitSatang', header: 'กำไรขั้นต้น', type: 'money' },
    { key: 'marginPct', header: 'Margin %', type: 'percent' },
    { key: 'revenueCaseCount', header: 'เคสที่มีรายได้', type: 'number' },
    { key: 'costCaseCount', header: 'เคสที่มีต้นทุน', type: 'number' },
  ]
}

/** ตารางหลักของ F1 — 1 แถว = 1 มิติ (บริษัทไฟแนนซ์ / ทีม) */
export function buildGrossProfitSummary(input: {
  dimension: ProfitDimension
  summary: ProfitabilityBreakdown
  /** ยอดรวมของช่วงก่อนหน้า — ฐานของ badge MoM (`96` §11) */
  previousTotal: GrossProfit
}): ReportData {
  const { dimension, summary, previousTotal } = input
  const total = summary.total

  const rows: ReportRow[] = summary.rows.map((row) => ({
    [ROW_KEY]: row.key,
    dimension: row.label,
    revenueSatang: row.revenueSatang,
    directCostSatang: row.directCostSatang,
    grossProfitSatang: row.grossProfitSatang,
    marginPct: row.marginPct,
    revenueCaseCount: row.revenueCaseCount,
    costCaseCount: row.costCaseCount,
  }))

  return {
    columns: summaryColumns(dimension),
    rows,
    kpis: [
      {
        key: 'revenue',
        label: 'รายได้รวม',
        value: total.revenueSatang,
        type: 'money',
        mom: momComparison(total.revenueSatang, previousTotal.revenueSatang),
      },
      {
        key: 'directCost',
        label: 'ต้นทุนตรงรวม',
        value: total.directCostSatang,
        type: 'money',
        mom: momComparison(total.directCostSatang, previousTotal.directCostSatang),
        higherIsBetter: false,
      },
      {
        key: 'grossProfit',
        label: 'กำไรขั้นต้น',
        value: total.grossProfitSatang,
        type: 'money',
        mom: momComparison(total.grossProfitSatang, previousTotal.grossProfitSatang),
      },
      {
        key: 'margin',
        label: 'Margin %',
        value: total.marginPct,
        type: 'percent',
        hint: `${summary.rows.length.toLocaleString('th-TH')} ${PROFIT_DIMENSION_LABEL[dimension]}`,
      },
    ],
    totalRow: {
      dimension: 'รวมทั้งหมด',
      revenueSatang: total.revenueSatang,
      directCostSatang: total.directCostSatang,
      grossProfitSatang: total.grossProfitSatang,
      marginPct: total.marginPct,
      revenueCaseCount: summary.rows.reduce((sum, row) => sum + row.revenueCaseCount, 0),
      costCaseCount: summary.rows.reduce((sum, row) => sum + row.costCaseCount, 0),
    },
    note: SUMMARY_NOTE,
  }
}

/** 1 เคสในมิติที่ผู้ใช้กดดูรายละเอียด (ยอดหลังปรับปรุงแล้วทั้งคู่) */
export interface GrossProfitCaseRow {
  caseId: string
  /** เลขสัญญาจากไฟแนนซ์ — `null` = เคสถูกลบ/หาไม่เจอ (ยังต้องแสดงยอด ห้ามทิ้งแถว) */
  caseRef: string | null
  companyName: string | null
  teamName: string | null
  status: string | null
  revenueSatang: number
  directCostSatang: number
}

const DRILLDOWN_COLUMNS: readonly ReportColumn[] = [
  { key: 'caseRef', header: 'เลขสัญญา', type: 'text', width: 20 },
  { key: 'companyName', header: 'บริษัทไฟแนนซ์', type: 'text', width: 24 },
  { key: 'teamName', header: 'ทีม', type: 'text', width: 20 },
  { key: 'statusLabel', header: 'สถานะเคส', type: 'text', width: 16 },
  { key: 'revenueSatang', header: 'รายได้', type: 'money' },
  { key: 'directCostSatang', header: 'ต้นทุนตรง', type: 'money' },
  { key: 'grossProfitSatang', header: 'กำไรขั้นต้น', type: 'money' },
  { key: 'marginPct', header: 'Margin %', type: 'percent' },
]

/**
 * Drill-down รายเคสของมิติเดียว (`96` §6-F1 "คลิกดูรายละเอียดรายเคสในมิตินั้น")
 *
 * ใช้ **ชุดข้อมูลเดียวกับตารางสรุป** (entry ดิบชุดเดิม) ⇒ ยอดรวมของ drill-down ต้องเท่ากับ
 * แถวสรุปของมิตินั้นเสมอ (`21` §15 — ตัวเลขสองหน้าจอขัดกันไม่ได้)
 */
export function buildGrossProfitDrilldown(input: {
  dimension: ProfitDimension
  dimensionLabel: string
  cases: readonly GrossProfitCaseRow[]
  /** ตัวแปลงสถานะเคสเป็นภาษาไทย (`lib/cases/status-display.ts`) — ส่งเข้ามาเพื่อคง pure */
  statusLabel: (status: string | null) => string
}): ReportData {
  const { dimension, dimensionLabel, cases, statusLabel } = input

  const rows: ReportRow[] = cases.map((row) => {
    const profit = grossProfit({ revenueSatang: row.revenueSatang, directCostSatang: row.directCostSatang })
    return {
      [ROW_KEY]: row.caseId,
      caseRef: row.caseRef,
      companyName: row.companyName,
      teamName: row.teamName,
      statusLabel: statusLabel(row.status),
      revenueSatang: profit.revenueSatang,
      directCostSatang: profit.directCostSatang,
      grossProfitSatang: profit.grossProfitSatang,
      marginPct: profit.marginPct,
    }
  })

  const total = summarizeGrossProfit(
    cases.map((row) => ({
      key: row.caseId,
      revenueSatang: row.revenueSatang,
      directCostSatang: row.directCostSatang,
    })),
  ).total

  return {
    columns: DRILLDOWN_COLUMNS,
    rows,
    kpis: [
      { key: 'revenue', label: 'รายได้', value: total.revenueSatang, type: 'money' },
      {
        key: 'directCost',
        label: 'ต้นทุนตรง',
        value: total.directCostSatang,
        type: 'money',
        higherIsBetter: false,
      },
      { key: 'grossProfit', label: 'กำไรขั้นต้น', value: total.grossProfitSatang, type: 'money' },
      {
        key: 'caseCount',
        label: 'จำนวนเคส',
        value: cases.length,
        type: 'number',
        hint: `${PROFIT_DIMENSION_LABEL[dimension]}: ${dimensionLabel}`,
      },
    ],
    totalRow: {
      caseRef: 'รวมทั้งหมด',
      companyName: null,
      teamName: null,
      statusLabel: null,
      revenueSatang: total.revenueSatang,
      directCostSatang: total.directCostSatang,
      grossProfitSatang: total.grossProfitSatang,
      marginPct: total.marginPct,
    },
    note: `รายละเอียดรายเคสของ ${PROFIT_DIMENSION_LABEL[dimension]} "${dimensionLabel}" — ยอดรวมตรงกับแถวของมิตินี้ในตารางสรุปเสมอ`,
  }
}

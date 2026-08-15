import { grossProfit } from '@/lib/finance/gross-profit'
import { sumSatang } from '@/lib/finance/satang'
import { fmtSatang } from '@/lib/format/money'
import { momComparison } from '@/lib/reports/kpi'
import { successPctOf } from '@/lib/reports/operations/success-rate-report'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { resolveReportPeriod, toIsoDateOnly } from '@/lib/reports/period'

/**
 * **E1 — KPI ภาพรวม (Executive Summary)** (`96` §6-E1) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **ไม่มีสูตรใหม่แม้แต่บรรทัดเดียว** — กำไรขั้นต้น/margin มาจาก `grossProfit()` (`22` §6.12 · 3.1)
 *   และ % สำเร็จมาจาก `successPctOf()` ของ O1 (ซึ่งเรียก `successRate()` ตัวกลาง `40` §6.2)
 * - **KPI = ช่วงเวลาที่ผู้ใช้เลือก** (ค่าเริ่มต้นของหน้าจอคือ "ปีนี้" ⇒ ตรงกับ "YTD" ของเอกสาร)
 *   ส่วน **ตาราง/กราฟ = 12 เดือนย้อนหลัง** นับถึงเดือนสุดท้ายของช่วงที่เลือก (`96` §6-E1
 *   "Revenue trend รายเดือน (12 เดือนย้อนหลัง)") — สองอย่างนี้คนละขอบเขตโดยตั้งใจ จึงต้องเขียนใน `note`
 * - **AR ค้างรับเป็นยอด ณ วันที่** ไม่ใช่ยอดของช่วง ⇒ ไม่มี badge MoM (เทียบแล้วความหมายเพี้ยน)
 * - ตัวหารเป็น 0 ⇒ `null` แสดง "N/A" **ห้ามหารศูนย์** (Rule 01) · เงินเป็น satang จำนวนเต็มเสมอ
 * - ข้อมูลชุดนี้แคช**รายวัน** (`96` §8) และหน้าจอต้องแสดงเวลาที่คำนวณล่าสุด (`96` §13 E1
 *   "refresh ไม่เกิน 24 ชั่วโมง พร้อมแสดงวันเวลา refresh ล่าสุด") — โครงแคช/ป้ายเวลาอยู่ที่ 6.1 แล้ว
 */

const MS_PER_DAY = 86_400_000

/** จำนวนเดือนของกราฟเทรนด์ (`96` §6-E1) */
export const TREND_MONTHS = 12

export interface MonthlyPeriod {
  /** `YYYY-MM-DD` (ค.ศ.) ของวันแรกในเดือน — คีย์เรียงลำดับภายในระบบ ห้ามแสดงตรง ๆ */
  key: string
  /** ป้ายที่ผู้ใช้เห็น — พ.ศ. เสมอ */
  label: string
  startDate: Date
  endDate: Date
}

/**
 * `count` เดือนย้อนหลังโดยนับ**เดือนของ `endDate`** เป็นเดือนสุดท้าย (เรียงเก่า → ใหม่)
 *
 * ขอบเดือนมาจาก `resolveReportPeriod()` (ปฏิทินไทย — 3.8) **ห้ามคิดขอบเดือนเอง**
 * · เดินถอยหลังด้วย "วันก่อนวันแรกของเดือน" จึงข้ามปี/เดือนสั้นได้ถูกเสมอ
 */
export function lastMonthlyPeriods(endDate: Date, count: number): readonly MonthlyPeriod[] {
  if (count <= 0) return []
  const periods: MonthlyPeriod[] = []
  let cursor = endDate
  for (let index = 0; index < count; index += 1) {
    const period = resolveReportPeriod('month', cursor)
    periods.push({
      key: toIsoDateOnly(period.startDate),
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
    })
    cursor = new Date(period.startDate.getTime() - MS_PER_DAY)
  }
  return periods.reverse()
}

/** ยอดของ 1 เดือนในกราฟเทรนด์ (เงินเป็น satang) */
export interface ExecutiveMonthEntry {
  monthKey: string
  monthLabel: string
  revenueSatang: number
  directCostSatang: number
  /** เคสที่รับเข้าระบบในเดือนนั้น (รวมเคสที่ยังไม่ปิด) */
  caseCount: number
  successCount: number
  failCount: number
}

/** ยอดรวมของช่วงเวลาหนึ่ง — ใช้ทั้งช่วงที่เลือกและช่วงก่อนหน้า (ฐานของ badge MoM) */
export interface ExecutiveTotals {
  revenueSatang: number
  directCostSatang: number
  caseCount: number
  successCount: number
  failCount: number
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'month', header: 'เดือน', type: 'text', width: 20 },
  { key: 'revenueSatang', header: 'รายได้', type: 'money' },
  { key: 'directCostSatang', header: 'ต้นทุนตรง', type: 'money' },
  { key: 'grossProfitSatang', header: 'กำไรขั้นต้น', type: 'money' },
  { key: 'marginPct', header: 'Margin %', type: 'percent' },
  { key: 'caseCount', header: 'เคสรับเข้า', type: 'number' },
  { key: 'successCount', header: 'ปิดสำเร็จ', type: 'number' },
  { key: 'failCount', header: 'ปิดไม่สำเร็จ', type: 'number' },
  { key: 'successPct', header: '% สำเร็จ', type: 'percent' },
]

function rowOf(month: ExecutiveMonthEntry): ReportRow {
  const profit = grossProfit({
    revenueSatang: month.revenueSatang,
    directCostSatang: month.directCostSatang,
  })
  return {
    [ROW_KEY]: month.monthKey,
    month: month.monthLabel,
    revenueSatang: month.revenueSatang,
    directCostSatang: month.directCostSatang,
    grossProfitSatang: profit.grossProfitSatang,
    marginPct: profit.marginPct,
    caseCount: month.caseCount,
    successCount: month.successCount,
    failCount: month.failCount,
    successPct: successPctOf(month.successCount, month.failCount),
  }
}

export function buildKpiSummaryReport(input: {
  /** 12 เดือนย้อนหลัง เรียงเก่า → ใหม่ (ผู้เรียกใช้ `lastMonthlyPeriods()`) */
  months: readonly ExecutiveMonthEntry[]
  /** ยอดของ**ช่วงที่ผู้ใช้เลือก** — ฐานของ KPI ทั้ง 6 การ์ด */
  current: ExecutiveTotals
  /** ยอดของช่วงก่อนหน้าที่ยาวเท่ากัน — ฐานของ badge MoM */
  previous: ExecutiveTotals
  /** ยอดลูกหนี้ค้างรับ ณ วันที่อ้างอิง (satang) — ไม่ผูกกับช่วงเวลา */
  arOutstandingSatang: number
  /** จำนวนบริษัทที่ยังมียอดค้าง — ข้อความใต้การ์ด AR */
  arCompanyCount: number
  /** ป้ายช่วงเวลาที่เลือก (พ.ศ.) — ใช้ในข้อความใต้การ์ด */
  rangeLabel: string
  /** ป้ายเดือนแรก–เดือนสุดท้ายของกราฟเทรนด์ (พ.ศ.) */
  trendLabel: string
}): ReportData {
  const { months, current, previous, arOutstandingSatang, arCompanyCount, rangeLabel, trendLabel } = input

  const rows = months.map(rowOf)

  const currentProfit = grossProfit({
    revenueSatang: current.revenueSatang,
    directCostSatang: current.directCostSatang,
  })
  const previousProfit = grossProfit({
    revenueSatang: previous.revenueSatang,
    directCostSatang: previous.directCostSatang,
  })
  const currentSuccessPct = successPctOf(current.successCount, current.failCount)
  const previousSuccessPct = successPctOf(previous.successCount, previous.failCount)
  const currentClosed = current.successCount + current.failCount

  const trendTotal = grossProfit({
    revenueSatang: sumSatang(months.map((month) => month.revenueSatang), 'รายได้ 12 เดือน'),
    directCostSatang: sumSatang(months.map((month) => month.directCostSatang), 'ต้นทุนตรง 12 เดือน'),
  })
  const trendCases = months.reduce((sum, month) => sum + month.caseCount, 0)
  const trendSuccess = months.reduce((sum, month) => sum + month.successCount, 0)
  const trendFail = months.reduce((sum, month) => sum + month.failCount, 0)

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'revenue',
        label: 'รายได้รวม',
        value: current.revenueSatang,
        type: 'money',
        hint: rangeLabel,
        mom: momComparison(current.revenueSatang, previous.revenueSatang),
      },
      {
        key: 'grossProfit',
        label: 'กำไรขั้นต้น',
        value: currentProfit.grossProfitSatang,
        type: 'money',
        hint: `ต้นทุนตรง ฿ ${fmtSatang(current.directCostSatang)}`,
        mom: momComparison(currentProfit.grossProfitSatang, previousProfit.grossProfitSatang),
      },
      {
        key: 'marginPct',
        label: 'Margin %',
        value: currentProfit.marginPct,
        type: 'percent',
        hint: 'กำไรขั้นต้น ÷ รายได้',
        mom: momComparison(currentProfit.marginPct ?? 0, previousProfit.marginPct ?? 0),
      },
      {
        key: 'caseCount',
        label: 'เคสทั้งหมด',
        value: current.caseCount,
        type: 'number',
        hint: `ปิดแล้ว ${currentClosed.toLocaleString('th-TH')} · ยังไม่ปิด ${(current.caseCount - currentClosed).toLocaleString('th-TH')}`,
        mom: momComparison(current.caseCount, previous.caseCount),
      },
      {
        key: 'successPct',
        label: '% สำเร็จ',
        value: currentSuccessPct,
        type: 'percent',
        hint: `สำเร็จ ${current.successCount.toLocaleString('th-TH')} จากเคสที่ปิดแล้ว ${currentClosed.toLocaleString('th-TH')}`,
        mom: momComparison(currentSuccessPct ?? 0, previousSuccessPct ?? 0),
      },
      {
        key: 'arOutstanding',
        label: 'AR ค้างรับ',
        value: arOutstandingSatang,
        type: 'money',
        hint: `${arCompanyCount.toLocaleString('th-TH')} บริษัทที่ยังมียอดค้าง`,
        higherIsBetter: false,
      },
    ],
    totalRow: {
      month: `รวม ${trendLabel}`,
      revenueSatang: trendTotal.revenueSatang,
      directCostSatang: trendTotal.directCostSatang,
      grossProfitSatang: trendTotal.grossProfitSatang,
      marginPct: trendTotal.marginPct,
      caseCount: trendCases,
      successCount: trendSuccess,
      failCount: trendFail,
      successPct: successPctOf(trendSuccess, trendFail),
    },
    note:
      `การ์ด KPI คิดจากช่วงที่เลือก (${rangeLabel}) เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน · ` +
      `ตารางและกราฟเป็นเทรนด์ ${TREND_MONTHS} เดือนย้อนหลัง (${trendLabel}) จึงมีขอบเขตกว้างกว่าการ์ด · ` +
      'เคสนับจากวันที่รับเข้าระบบ · % สำเร็จ คิดจากเคสที่ปิดแล้วเท่านั้น · ' +
      'AR ค้างรับเป็นยอด ณ วันที่คำนวณ ไม่ใช่ยอดของช่วงเวลา ⇒ ไม่มีการเทียบกับงวดก่อน',
  }
}

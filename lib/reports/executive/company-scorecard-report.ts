import { grossProfit } from '@/lib/finance/gross-profit'
import { sumSatang } from '@/lib/finance/satang'
import { fmtRatioPct } from '@/lib/format/money'
import { momComparison } from '@/lib/reports/kpi'
import { successPctOf } from '@/lib/reports/operations/success-rate-report'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **E2 — Scorecard รายบริษัทไฟแนนซ์** (`96` §6-E2) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * คอลัมน์ตามเอกสารตรงตัว: บริษัท | เคสทั้งหมด | Success Rate | Revenue | Gross Profit | Margin % |
 * AR ค้าง | เทรนด์ (↑↓)
 *
 * ### กติกาที่ห้ามหลุด
 * - **ไม่มีสูตรใหม่**: กำไร/margin = `grossProfit()` (`22` §6.12) · % สำเร็จ = `successPctOf()` ของ O1
 *   (ต่อไปยัง `successRate()` ตัวกลาง `40` §6.2) · ยอด AR มาจาก `arOutstandingSatang()` (`22` §6.11)
 *   ที่ผู้เรียกคิดมาแล้ว — ไฟล์นี้แค่จัดตาราง
 * - **เทรนด์ = การเปลี่ยนแปลงของรายได้เทียบช่วงก่อนหน้าที่ยาวเท่ากัน** (คอลัมน์ `percent`
 *   ⇒ ค่าติดลบอ่านได้ว่าลดลง) · ช่วงก่อนหน้าเป็น 0 ⇒ `null` แสดง "N/A" **ห้ามหารศูนย์**
 * - **AR เป็นยอด ณ วันที่** (ไม่ผูกช่วงเวลา) — บริษัทที่ไม่มีความเคลื่อนไหวในช่วงแต่ยังมีหนี้ค้าง
 *   ต้องยังอยู่ในตาราง ไม่งั้นผู้บริหารมองไม่เห็นหนี้ที่ค้างข้ามงวด
 */

/** 1 บริษัทไฟแนนซ์ — เงินเป็น satang และผ่าน `netAfterAdjustments()` มาแล้วทั้งหมด (`20` §9) */
export interface CompanyScorecardEntry {
  companyId: string
  companyName: string
  /** เคสที่รับเข้าระบบในช่วงที่เลือก (รวมเคสที่ยังไม่ปิด) */
  caseCount: number
  successCount: number
  failCount: number
  revenueSatang: number
  directCostSatang: number
  /** รายได้ของช่วงก่อนหน้าที่ยาวเท่ากัน — ฐานของคอลัมน์เทรนด์ */
  previousRevenueSatang: number
  /** ยอดค้างรับ ณ วันที่อ้างอิง */
  arOutstandingSatang: number
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'company', header: 'บริษัทไฟแนนซ์', type: 'text', width: 28 },
  { key: 'caseCount', header: 'เคสทั้งหมด', type: 'number' },
  { key: 'successPct', header: '% สำเร็จ', type: 'percent' },
  { key: 'revenueSatang', header: 'รายได้', type: 'money' },
  { key: 'grossProfitSatang', header: 'กำไรขั้นต้น', type: 'money' },
  { key: 'marginPct', header: 'Margin %', type: 'percent' },
  { key: 'arOutstandingSatang', header: 'AR ค้าง', type: 'money', tone: 'warning' },
  { key: 'revenueTrendPct', header: 'เทรนด์รายได้', type: 'percent' },
]

/** บริษัทที่ไม่มีอะไรเลยในช่วงนี้และไม่มีหนี้ค้าง = ไม่มีอะไรให้ผู้บริหารตัดสินใจ ⇒ ไม่ต้องมีแถว */
function hasActivity(entry: CompanyScorecardEntry): boolean {
  return (
    entry.caseCount > 0 ||
    entry.revenueSatang !== 0 ||
    entry.directCostSatang !== 0 ||
    entry.arOutstandingSatang !== 0 ||
    entry.previousRevenueSatang !== 0
  )
}

export function buildCompanyScorecardReport(input: {
  companies: readonly CompanyScorecardEntry[]
  /** ป้ายช่วงเวลาที่เลือก (พ.ศ.) */
  rangeLabel: string
}): ReportData {
  const { rangeLabel } = input

  const companies = input.companies
    .filter(hasActivity)
    .map((entry) => ({ entry, profit: grossProfit({ revenueSatang: entry.revenueSatang, directCostSatang: entry.directCostSatang }) }))
    .sort(
      (a, b) =>
        b.entry.revenueSatang - a.entry.revenueSatang ||
        b.profit.grossProfitSatang - a.profit.grossProfitSatang ||
        a.entry.companyName.localeCompare(b.entry.companyName, 'th'),
    )

  const rows: ReportRow[] = companies.map(({ entry, profit }) => ({
    [ROW_KEY]: entry.companyId,
    company: entry.companyName,
    caseCount: entry.caseCount,
    successPct: successPctOf(entry.successCount, entry.failCount),
    revenueSatang: entry.revenueSatang,
    grossProfitSatang: profit.grossProfitSatang,
    marginPct: profit.marginPct,
    arOutstandingSatang: entry.arOutstandingSatang,
    revenueTrendPct: momComparison(entry.revenueSatang, entry.previousRevenueSatang).changePct,
  }))

  const totalRevenue = sumSatang(companies.map(({ entry }) => entry.revenueSatang), 'รายได้รวม')
  const totalCost = sumSatang(companies.map(({ entry }) => entry.directCostSatang), 'ต้นทุนตรงรวม')
  const totalPreviousRevenue = sumSatang(
    companies.map(({ entry }) => entry.previousRevenueSatang),
    'รายได้ช่วงก่อนหน้า',
  )
  const totalAr = sumSatang(companies.map(({ entry }) => entry.arOutstandingSatang), 'ยอดค้างรับรวม')
  const totalProfit = grossProfit({ revenueSatang: totalRevenue, directCostSatang: totalCost })
  const totalCases = companies.reduce((sum, { entry }) => sum + entry.caseCount, 0)
  const totalSuccess = companies.reduce((sum, { entry }) => sum + entry.successCount, 0)
  const totalFail = companies.reduce((sum, { entry }) => sum + entry.failCount, 0)
  const totalTrend = momComparison(totalRevenue, totalPreviousRevenue)

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'revenue',
        label: 'รายได้รวม',
        value: totalRevenue,
        type: 'money',
        hint: rangeLabel,
        mom: totalTrend,
      },
      {
        key: 'grossProfit',
        label: 'กำไรขั้นต้นรวม',
        value: totalProfit.grossProfitSatang,
        type: 'money',
        hint: `Margin ${fmtRatioPct(totalProfit.marginPct)}`,
      },
      {
        key: 'arOutstanding',
        label: 'AR ค้างรับรวม',
        value: totalAr,
        type: 'money',
        hint: 'ยอด ณ วันที่คำนวณ',
        higherIsBetter: false,
      },
      {
        key: 'companyCount',
        label: 'บริษัทที่มีความเคลื่อนไหว',
        value: rows.length,
        type: 'number',
        hint: `${totalCases.toLocaleString('th-TH')} เคสในช่วงนี้`,
      },
    ],
    totalRow: {
      company: 'รวมทั้งหมด',
      caseCount: totalCases,
      successPct: successPctOf(totalSuccess, totalFail),
      revenueSatang: totalRevenue,
      grossProfitSatang: totalProfit.grossProfitSatang,
      marginPct: totalProfit.marginPct,
      arOutstandingSatang: totalAr,
      revenueTrendPct: totalTrend.changePct,
    },
    note:
      `ขอบเขต: เคสนับจากวันที่รับเข้าระบบในช่วง ${rangeLabel} · รายได้/ต้นทุนตรงคิดตามวันที่เกิดรายการในช่วงเดียวกัน (ยอดหลังรายการปรับปรุงที่อนุมัติแล้ว) · ` +
      '% สำเร็จ คิดจากเคสที่ปิดแล้วเท่านั้น · ' +
      'AR ค้าง เป็นยอด ณ วันที่คำนวณ (ไม่ผูกกับช่วงเวลา) · เทรนด์ = รายได้เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน',
  }
}

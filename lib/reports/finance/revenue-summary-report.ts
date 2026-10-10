import { successRateOf } from '@/lib/assignments/success-rate'
import { sumSatang } from '@/lib/finance/satang'
import { momComparison } from '@/lib/reports/kpi'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **F2 — สรุปรายได้** (`96` §6-F2) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - รายได้ที่ใช้คือ **ยอดก่อน VAT** (`revenues.gross_satang` หลังรายการปรับปรุง) — VAT ไม่ใช่รายได้
 *   ของบริษัท (`22` §6.12) ⇒ ผู้เรียกต้องส่งยอดที่ผ่าน `netAfterAdjustments()` มาแล้ว
 * - **% สำเร็จ นับจากเคสที่ปิดแล้วเท่านั้น** (`96` §13 O1 — `success / (success + fail)`) เคสที่ยัง
 *   ไม่ปิดไม่เข้าตัวหาร · ตัวหารเป็น 0 ⇒ `null` แสดง "N/A" **ห้ามหารศูนย์** (Rule 01)
 * - **เคส `closed_fail` ต้องเข้าตัวหาร** (มติ PO 05/10/2569 U55/O30 — CO2 สำเร็จ 1 + ไม่สำเร็จ 1 = 50%)
 *   เคสไม่สำเร็จไม่มีรายได้ จึงไม่โผล่ใน `entries` ⇒ ผู้เรียกส่งแยกมาทาง `failCases` (จัดกลุ่มตามวันที่ปิดเคส)
 *   — นับเฉพาะคอลัมน์ "ไม่สำเร็จ" + ตัวหาร % สำเร็จ · **ไม่**นับใน "เคสทั้งหมด"/"รายได้ต่อเคส" (ฐานเคสที่มีรายได้)
 * - **Revenue ต่อเคสหารด้วยจำนวนเคสไม่ซ้ำ** (1 เคสอาจมีรายได้หลายใบจาก recycle) — คิดด้วย
 *   จำนวนเต็มสตางค์แล้วปัดครั้งเดียว ห้ามคำนวณฝั่งแสดงผล
 * - MoM ของ **รายเดือน/รายไตรมาส** เทียบกับ**งวดก่อนหน้าในอนุกรมเดียวกัน** (งวดแรกใช้งวดสุดท้าย
 *   ของช่วงก่อนหน้า) · ของ **รายบริษัท** เทียบกับบริษัทเดียวกันในช่วงก่อนหน้า — คนละความหมาย
 *   จึงต้องส่งข้อมูลช่วงก่อนหน้าเข้ามาทั้งชุด ห้ามเดาจากตัวเลขในช่วงปัจจุบัน
 */

export const REVENUE_GROUP_BYS = ['month', 'quarter', 'company'] as const
export type RevenueGroupBy = (typeof REVENUE_GROUP_BYS)[number]

export const REVENUE_GROUP_BY_LABEL: Readonly<Record<RevenueGroupBy, string>> = {
  month: 'รายเดือน',
  quarter: 'รายไตรมาส',
  company: 'รายบริษัทไฟแนนซ์',
}

const GROUP_COLUMN_HEADER: Readonly<Record<RevenueGroupBy, string>> = {
  month: 'เดือน',
  quarter: 'ไตรมาส',
  company: 'บริษัทไฟแนนซ์',
}

/** รายได้ 1 ใบที่ถูกจัดกลุ่มแล้ว (ยอด**หลังปรับปรุง** — ผู้เรียกใช้ `netAfterAdjustments()`) */
export interface RevenueSummaryEntry {
  groupKey: string
  groupLabel: string
  /** ลำดับการเรียงของกลุ่ม — เดือน/ไตรมาสใช้ `YYYY-MM-DD` ของวันแรกในงวด (ค.ศ. ภายในระบบ) */
  groupSort: string
  caseId: string
  /** สถานะเคสของรายได้ใบนี้ (`cases.status`) — `null` = หาเคสไม่เจอ */
  caseStatus: string | null
  revenueSatang: number
}

/**
 * เคสที่ปิดไม่สำเร็จในช่วงรายงาน (U55) — จัดกลุ่มด้วยวันที่ปิดเคส (เวลาไทย) / บริษัทของเคส
 * ใช้เติมตัวหารของ % สำเร็จเท่านั้น
 */
export type RevenueSummaryFailCase = Pick<RevenueSummaryEntry, 'groupKey' | 'groupLabel' | 'groupSort' | 'caseId'>

interface Bucket {
  key: string
  label: string
  sort: string
  revenueSatang: number
  cases: Set<string>
  successCases: Set<string>
  failCases: Set<string>
}

function groupEntries(
  entries: readonly RevenueSummaryEntry[],
  failCases: readonly RevenueSummaryFailCase[] = [],
): Bucket[] {
  const buckets = new Map<string, Bucket>()
  const bucketOf = (entry: RevenueSummaryFailCase): Bucket => {
    let bucket = buckets.get(entry.groupKey)
    if (bucket === undefined) {
      bucket = {
        key: entry.groupKey,
        label: entry.groupLabel,
        sort: entry.groupSort,
        revenueSatang: 0,
        cases: new Set(),
        successCases: new Set(),
        failCases: new Set(),
      }
      buckets.set(entry.groupKey, bucket)
    }
    return bucket
  }
  for (const failCase of failCases) bucketOf(failCase).failCases.add(failCase.caseId)
  for (const entry of entries) {
    const bucket = bucketOf(entry)
    bucket.revenueSatang += entry.revenueSatang
    bucket.cases.add(entry.caseId)
    if (entry.caseStatus === 'closed_success') bucket.successCases.add(entry.caseId)
    if (entry.caseStatus === 'closed_fail') bucket.failCases.add(entry.caseId)
  }
  return [...buckets.values()]
}

/** `22` — รายได้เฉลี่ยต่อเคส คิดจากสตางค์จำนวนเต็ม · ไม่มีเคส ⇒ `null` (ห้ามหารศูนย์) */
export function revenuePerCaseSatang(revenueSatang: number, caseCount: number): number | null {
  if (caseCount <= 0) return null
  return Math.round(revenueSatang / caseCount)
}

function sortBuckets(buckets: Bucket[], groupBy: RevenueGroupBy): Bucket[] {
  return groupBy === 'company'
    ? [...buckets].sort((a, b) => b.revenueSatang - a.revenueSatang || a.label.localeCompare(b.label, 'th'))
    : [...buckets].sort((a, b) => a.sort.localeCompare(b.sort))
}

function columnsOf(groupBy: RevenueGroupBy): readonly ReportColumn[] {
  return [
    { key: 'group', header: GROUP_COLUMN_HEADER[groupBy], type: 'text', width: 26 },
    { key: 'revenueSatang', header: 'รายได้รวม', type: 'money' },
    { key: 'caseCount', header: 'เคสทั้งหมด', type: 'number' },
    { key: 'successCount', header: 'สำเร็จ', type: 'number' },
    { key: 'failCount', header: 'ไม่สำเร็จ', type: 'number' },
    { key: 'successPct', header: '% สำเร็จ', type: 'percent' },
    { key: 'revenuePerCaseSatang', header: 'รายได้/เคส', type: 'money' },
    { key: 'changePct', header: 'เปลี่ยนแปลง MoM', type: 'percent' },
  ]
}

export function buildRevenueSummary(input: {
  groupBy: RevenueGroupBy
  entries: readonly RevenueSummaryEntry[]
  /** รายได้ของ**ช่วงก่อนหน้าที่ยาวเท่ากัน** — ฐานของคอลัมน์ MoM และ badge บน KPI */
  previousEntries: readonly RevenueSummaryEntry[]
  /** เคสที่ปิดไม่สำเร็จในช่วง (U55) — เข้าตัวหาร % สำเร็จ · ไม่ระบุ = ไม่มี */
  failCases?: readonly RevenueSummaryFailCase[]
}): ReportData {
  const { groupBy, entries, previousEntries } = input
  const failCases = input.failCases ?? []

  const buckets = sortBuckets(groupEntries(entries, failCases), groupBy)
  const previousBuckets = sortBuckets(groupEntries(previousEntries), groupBy)
  const previousByKey = new Map(previousBuckets.map((bucket) => [bucket.key, bucket.revenueSatang]))
  const previousTail = previousBuckets.at(-1)?.revenueSatang ?? 0

  /**
   * ฐานเปรียบเทียบของแถวที่ `index`
   * — รายบริษัท: บริษัทเดียวกันในช่วงก่อนหน้า · รายเดือน/ไตรมาส: งวดก่อนหน้าในอนุกรม
   */
  const baseOf = (bucket: Bucket, index: number): number =>
    groupBy === 'company'
      ? (previousByKey.get(bucket.key) ?? 0)
      : (buckets[index - 1]?.revenueSatang ?? previousTail)

  const rows: ReportRow[] = buckets.map((bucket, index) => {
    const caseCount = bucket.cases.size
    return {
      [ROW_KEY]: bucket.key,
      group: bucket.label,
      revenueSatang: bucket.revenueSatang,
      caseCount,
      successCount: bucket.successCases.size,
      failCount: bucket.failCases.size,
      successPct: successRateOf(bucket.successCases.size, bucket.failCases.size),
      revenuePerCaseSatang: revenuePerCaseSatang(bucket.revenueSatang, caseCount),
      changePct: momComparison(bucket.revenueSatang, baseOf(bucket, index)).changePct,
    }
  })

  const totalRevenue = sumSatang(buckets.map((bucket) => bucket.revenueSatang), 'รายได้รวม')
  const previousRevenue = sumSatang(previousBuckets.map((bucket) => bucket.revenueSatang), 'รายได้รวมงวดก่อน')
  const caseCount = new Set(entries.map((entry) => entry.caseId)).size
  const previousCaseCount = new Set(previousEntries.map((entry) => entry.caseId)).size
  const successCount = new Set(
    entries.filter((entry) => entry.caseStatus === 'closed_success').map((entry) => entry.caseId),
  ).size
  const failCount = new Set([
    ...entries.filter((entry) => entry.caseStatus === 'closed_fail').map((entry) => entry.caseId),
    ...failCases.map((failCase) => failCase.caseId),
  ]).size
  const perCase = revenuePerCaseSatang(totalRevenue, caseCount)
  const previousPerCase = revenuePerCaseSatang(previousRevenue, previousCaseCount)

  return {
    columns: columnsOf(groupBy),
    rows,
    kpis: [
      {
        key: 'revenue',
        label: 'รายได้รวม',
        value: totalRevenue,
        type: 'money',
        mom: momComparison(totalRevenue, previousRevenue),
      },
      {
        key: 'caseCount',
        label: 'จำนวนเคส',
        value: caseCount,
        type: 'number',
        hint: `สำเร็จ ${successCount.toLocaleString('th-TH')} · ไม่สำเร็จ ${failCount.toLocaleString('th-TH')}`,
        mom: momComparison(caseCount, previousCaseCount),
      },
      {
        key: 'revenuePerCase',
        label: 'รายได้ต่อเคสเฉลี่ย',
        value: perCase,
        type: 'money',
        mom: momComparison(perCase ?? 0, previousPerCase ?? 0),
      },
    ],
    totalRow: {
      group: 'รวมทั้งหมด',
      revenueSatang: totalRevenue,
      caseCount,
      successCount,
      failCount,
      successPct: successRateOf(successCount, failCount),
      revenuePerCaseSatang: perCase,
      changePct: momComparison(totalRevenue, previousRevenue).changePct,
    },
    note:
      'รายได้เป็นยอดก่อน VAT หลังรายการปรับปรุงที่อนุมัติแล้ว · จำนวนเคสนับแบบไม่ซ้ำ (เคสรีไซเคิลที่ทำรายได้หลายรอบนับเคสเดียว) · ' +
      'ไม่สำเร็จ = เคสที่ปิดไม่สำเร็จในช่วง (ไม่มีรายได้ จึงไม่นับในเคสทั้งหมดและรายได้ต่อเคส) · ' +
      '% สำเร็จ = สำเร็จ ÷ (สำเร็จ + ไม่สำเร็จ) — เคสที่ยังไม่ปิดไม่เข้าตัวหาร · MoM เทียบกับ' +
      (groupBy === 'company' ? 'บริษัทเดียวกันในช่วงก่อนหน้าที่ยาวเท่ากัน' : 'งวดก่อนหน้าในอนุกรมเดียวกัน'),
  }
}

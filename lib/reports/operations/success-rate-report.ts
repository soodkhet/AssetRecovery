import { successRate } from '@/lib/assignments/success-rate'
import { momComparison } from '@/lib/reports/kpi'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **O1 — อัตราความสำเร็จ** (`96` §6-O1) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **% สำเร็จ = สำเร็จ ÷ (สำเร็จ + ไม่สำเร็จ) เท่านั้น — เคสที่ยังไม่ปิดไม่เข้าตัวหาร** (`96` §13/§14)
 *   ⇒ คำนวณผ่าน `successRate()` (`lib/assignments/success-rate.ts` — ค่ากลางของทั้งระบบ)
 *   โดยส่ง `assignedCount = สำเร็จ + ไม่สำเร็จ` **ห้ามเขียนสูตรหารเองซ้ำที่นี่**
 * - ตัวหารเป็น 0 (ยังไม่มีเคสปิดเลย) ⇒ `null` แสดง "N/A" **ห้ามหารศูนย์** (Rule 01)
 * - ขอบเขตของรายงานคือ **เคสที่ถูกสร้างในช่วงที่เลือก** (`cases.created_at`) ⇒ คอลัมน์ "เคสทั้งหมด"
 *   รวมเคสที่ยังไม่ปิดด้วย — นี่คือเหตุผลที่ §14 ต้องมีเทสต์ว่าเคส open ไม่ถูกนับใน success/fail
 * - MoM เทียบกับ**ช่วงก่อนหน้าที่ยาวเท่ากัน** ⇒ ผู้เรียกต้องส่งข้อมูลช่วงก่อนหน้ามาทั้งชุด
 */

export const SUCCESS_RATE_DIMENSIONS = ['team', 'company', 'month'] as const
export type SuccessRateDimension = (typeof SUCCESS_RATE_DIMENSIONS)[number]

export const SUCCESS_RATE_DIMENSION_LABEL: Readonly<Record<SuccessRateDimension, string>> = {
  team: 'รายทีม',
  company: 'รายบริษัทไฟแนนซ์',
  month: 'รายเดือน',
}

const GROUP_COLUMN_HEADER: Readonly<Record<SuccessRateDimension, string>> = {
  team: 'ทีม',
  company: 'บริษัทไฟแนนซ์',
  month: 'เดือน',
}

/** ผลของเคส — `null` = ยังไม่ปิด (นับใน "เคสทั้งหมด" แต่ไม่เข้าสูตร % สำเร็จ) */
export type CaseOutcomeValue = 'closed_success' | 'closed_fail' | null

export interface SuccessRateCaseEntry {
  groupKey: string
  groupLabel: string
  /** ลำดับการเรียงของกลุ่ม — รายเดือนใช้ `YYYY-MM-DD` ของวันแรกในเดือน (ค.ศ. ภายในระบบ) */
  groupSort: string
  caseId: string
  outcome: CaseOutcomeValue
}

interface Bucket {
  key: string
  label: string
  sort: string
  cases: Set<string>
  successCases: Set<string>
  failCases: Set<string>
}

function groupEntries(entries: readonly SuccessRateCaseEntry[]): Bucket[] {
  const buckets = new Map<string, Bucket>()
  for (const entry of entries) {
    let bucket = buckets.get(entry.groupKey)
    if (bucket === undefined) {
      bucket = {
        key: entry.groupKey,
        label: entry.groupLabel,
        sort: entry.groupSort,
        cases: new Set(),
        successCases: new Set(),
        failCases: new Set(),
      }
      buckets.set(entry.groupKey, bucket)
    }
    bucket.cases.add(entry.caseId)
    if (entry.outcome === 'closed_success') bucket.successCases.add(entry.caseId)
    if (entry.outcome === 'closed_fail') bucket.failCases.add(entry.caseId)
  }
  return [...buckets.values()]
}

function sortBuckets(buckets: Bucket[], dimension: SuccessRateDimension): Bucket[] {
  return dimension === 'month'
    ? [...buckets].sort((a, b) => a.sort.localeCompare(b.sort))
    : [...buckets].sort((a, b) => b.cases.size - a.cases.size || a.label.localeCompare(b.label, 'th'))
}

function columnsOf(dimension: SuccessRateDimension): readonly ReportColumn[] {
  return [
    { key: 'group', header: GROUP_COLUMN_HEADER[dimension], type: 'text', width: 26 },
    { key: 'caseCount', header: 'เคสทั้งหมด', type: 'number' },
    { key: 'successCount', header: 'สำเร็จ', type: 'number' },
    { key: 'failCount', header: 'ไม่สำเร็จ', type: 'number' },
    { key: 'openCount', header: 'ยังไม่ปิด', type: 'number' },
    { key: 'successPct', header: '% สำเร็จ', type: 'percent' },
    { key: 'changePct', header: 'เปลี่ยนแปลง MoM', type: 'percent' },
  ]
}

/**
 * สัดส่วนของ `part` เทียบกับ**เคสที่ปิดแล้วทั้งหมด** (`part + counterpart`) — `96` §13 O1
 *
 * ใช้ `successRate()` ตัวกลางของระบบ (`40` §6.2) โดยจงใจส่งเคสที่ปิดแล้วเป็นตัวหาร
 * ⇒ ได้ทั้ง % สำเร็จ (`part = สำเร็จ`) และ % ไม่สำเร็จ (`part = ไม่สำเร็จ`) จากสูตรเดียวกัน
 */
function successPctOf(part: number, counterpart: number): number | null {
  return successRate({ successCount: part, assignedCount: part + counterpart })
}

export function buildSuccessRateReport(input: {
  dimension: SuccessRateDimension
  entries: readonly SuccessRateCaseEntry[]
  /** ข้อมูลของ**ช่วงก่อนหน้าที่ยาวเท่ากัน** — ฐานของคอลัมน์ MoM และ badge บน KPI */
  previousEntries: readonly SuccessRateCaseEntry[]
}): ReportData {
  const { dimension, entries, previousEntries } = input

  const buckets = sortBuckets(groupEntries(entries), dimension)
  const previousBuckets = sortBuckets(groupEntries(previousEntries), dimension)
  const previousPctByKey = new Map(
    previousBuckets.map((bucket) => [bucket.key, successPctOf(bucket.successCases.size, bucket.failCases.size)]),
  )
  const previousTailPct = previousBuckets.at(-1)
  const previousTail =
    previousTailPct === undefined
      ? null
      : successPctOf(previousTailPct.successCases.size, previousTailPct.failCases.size)

  /**
   * ฐานเปรียบเทียบของแถวที่ `index`
   * — รายทีม/รายบริษัท: กลุ่มเดียวกันในช่วงก่อนหน้า · รายเดือน: เดือนก่อนหน้าในอนุกรมเดียวกัน
   */
  const baseOf = (bucket: Bucket, index: number): number => {
    if (dimension !== 'month') return previousPctByKey.get(bucket.key) ?? 0
    const previousRow = buckets[index - 1]
    if (previousRow === undefined) return previousTail ?? 0
    return successPctOf(previousRow.successCases.size, previousRow.failCases.size) ?? 0
  }

  const rows: ReportRow[] = buckets.map((bucket, index) => {
    const successCount = bucket.successCases.size
    const failCount = bucket.failCases.size
    const pct = successPctOf(successCount, failCount)
    return {
      [ROW_KEY]: bucket.key,
      group: bucket.label,
      caseCount: bucket.cases.size,
      successCount,
      failCount,
      openCount: bucket.cases.size - successCount - failCount,
      successPct: pct,
      changePct: momComparison(pct ?? 0, baseOf(bucket, index)).changePct,
    }
  })

  const totalCases = new Set(entries.map((entry) => entry.caseId)).size
  const totalSuccess = new Set(
    entries.filter((entry) => entry.outcome === 'closed_success').map((entry) => entry.caseId),
  ).size
  const totalFail = new Set(
    entries.filter((entry) => entry.outcome === 'closed_fail').map((entry) => entry.caseId),
  ).size
  const previousSuccess = new Set(
    previousEntries.filter((entry) => entry.outcome === 'closed_success').map((entry) => entry.caseId),
  ).size
  const previousFail = new Set(
    previousEntries.filter((entry) => entry.outcome === 'closed_fail').map((entry) => entry.caseId),
  ).size

  const totalPct = successPctOf(totalSuccess, totalFail)
  const previousPct = successPctOf(previousSuccess, previousFail)
  const failPct = successPctOf(totalFail, totalSuccess)
  const previousFailPct = successPctOf(previousFail, previousSuccess)
  const closedCount = totalSuccess + totalFail

  return {
    columns: columnsOf(dimension),
    rows,
    kpis: [
      {
        key: 'caseCount',
        label: 'เคสทั้งหมด',
        value: totalCases,
        type: 'number',
        hint: `ปิดแล้ว ${closedCount.toLocaleString('th-TH')} · ยังไม่ปิด ${(totalCases - closedCount).toLocaleString('th-TH')}`,
        mom: momComparison(totalCases, new Set(previousEntries.map((entry) => entry.caseId)).size),
      },
      {
        key: 'successPct',
        label: '% สำเร็จ',
        value: totalPct,
        type: 'percent',
        hint: `สำเร็จ ${totalSuccess.toLocaleString('th-TH')} จากเคสที่ปิดแล้ว ${closedCount.toLocaleString('th-TH')}`,
        mom: momComparison(totalPct ?? 0, previousPct ?? 0),
      },
      {
        key: 'failPct',
        label: '% ไม่สำเร็จ',
        value: failPct,
        type: 'percent',
        hint: `ไม่สำเร็จ ${totalFail.toLocaleString('th-TH')} เคส`,
        mom: momComparison(failPct ?? 0, previousFailPct ?? 0),
        higherIsBetter: false,
      },
    ],
    totalRow: {
      group: 'รวมทั้งหมด',
      caseCount: totalCases,
      successCount: totalSuccess,
      failCount: totalFail,
      openCount: totalCases - closedCount,
      successPct: totalPct,
      changePct: momComparison(totalPct ?? 0, previousPct ?? 0).changePct,
    },
    note:
      'ขอบเขต = เคสที่รับเข้าระบบในช่วงที่เลือก (นับเคสไม่ซ้ำ) · ' +
      '% สำเร็จ คิดจากเคสที่ปิดแล้วเท่านั้น (สำเร็จ ÷ (สำเร็จ + ไม่สำเร็จ)) — เคสที่ยังไม่ปิดไม่เข้าตัวหาร · ' +
      'MoM เทียบกับ' +
      (dimension === 'month' ? 'เดือนก่อนหน้าในอนุกรมเดียวกัน' : 'กลุ่มเดียวกันในช่วงก่อนหน้าที่ยาวเท่ากัน'),
  }
}

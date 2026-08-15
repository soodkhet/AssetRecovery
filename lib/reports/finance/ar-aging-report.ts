import { arOutstandingSatang, summarizeArAging, type ArAgingRow } from '@/lib/finance/ar-calc'
import { sumSatang } from '@/lib/finance/satang'
import { fmtDate } from '@/lib/format/datetime'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { toIsoDateOnly } from '@/lib/reports/period'
import { describeAgingBuckets } from '@/lib/settings/finance-policy'

/**
 * **F3 — อายุหนี้ลูกค้า (AR Aging)** (`96` §6-F3) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **ช่วงอายุหนี้เป็นค่าตั้งขององค์กร** (`13` §6.2.1 · ค่าเริ่มต้น `[30, 60, 90]`) — คอลัมน์สร้างจาก
 *   ค่าตั้งเสมอ **ห้าม hardcode 4 ช่วง** · ป้ายช่วงใช้ `describeAgingBuckets()` และการจัดยอดลงช่วงใช้
 *   `summarizeArAging()` (`22` §6.11) ตัวเดียวกับหน้า AR ของไฟล์ 19 ⇒ ตัวเลขสองหน้าจอตรงกันเสมอ
 * - **เกิน 60 วัน = เหลือง · เกิน 90 วัน = แดง** (`96` §6-F3) — ตัดสินจาก**ขอบล่าง**ของช่วง
 *   ⇒ ช่วง `61-90` เหลือง · ช่วง `90+` แดง · ช่วง `31-60` ยังปกติ (ยังไม่เกิน 60)
 * - นับเฉพาะบิลที่ยังมียอดค้าง (`outstanding > 0`) — ตัวสรุปกลางกรองให้แล้ว ห้ามกรองซ้ำแบบอื่น
 */

/** 1 บริษัทไฟแนนซ์ + รอบวางบิลที่ยังไม่ปิดยอดของบริษัทนั้น */
export interface ArAgingCompanyEntry {
  companyId: string
  companyName: string
  batches: readonly ArAgingRow[]
}

const OVER_60 = 60
const OVER_90 = 90

/** ขอบล่างของช่วงที่ `index` — ช่วงแรกเริ่มที่ 0 · ช่วงถัดไปเริ่มที่ "ขอบบนของช่วงก่อนหน้า + 1" */
export function agingLowerBound(buckets: readonly number[], index: number): number {
  if (index === 0) return 0
  const previous = buckets[index - 1]
  return previous === undefined ? 0 : previous + 1
}

export function agingColumnTone(buckets: readonly number[], index: number): 'default' | 'warning' | 'danger' {
  const lower = agingLowerBound(buckets, index)
  if (lower > OVER_90) return 'danger'
  if (lower > OVER_60) return 'warning'
  return 'default'
}

function bucketKey(index: number): string {
  return `bucket${index}`
}

/** วันครบกำหนดล่าสุดของบิลที่ยังค้างของบริษัทนี้ — ไม่มีบิลค้าง ⇒ `null` (แสดง `—`) */
function latestDueDate(batches: readonly ArAgingRow[]): string | null {
  const times = batches.filter((batch) => arOutstandingSatang(batch) > 0).map((batch) => batch.dueDate.getTime())
  if (times.length === 0) return null
  return toIsoDateOnly(new Date(Math.max(...times)))
}

interface CompanyAging {
  companyId: string
  companyName: string
  outstandingSatang: number
  batchCount: number
  byBucket: readonly number[]
  latestDueDate: string | null
}

export function buildArAgingReport(input: {
  companies: readonly ArAgingCompanyEntry[]
  /** ช่วงอายุหนี้จาก `finance_policy_settings.ar_aging_buckets` */
  buckets: readonly number[]
  /** วันที่ใช้คำนวณอายุหนี้ (date-only) */
  asOf: Date
}): ReportData {
  const { companies, asOf } = input
  // ต้องเป็นชุดเดียวกับที่ `summarizeArAging()` ใช้ภายใน ไม่งั้นป้ายคอลัมน์กับยอดสลับช่อง
  const buckets = [...new Set(input.buckets)].sort((a, b) => a - b)
  const labels = describeAgingBuckets(buckets)

  const aging: CompanyAging[] = companies
    .map((company) => {
      const summary = summarizeArAging(company.batches, buckets, asOf)
      return {
        companyId: company.companyId,
        companyName: company.companyName,
        outstandingSatang: sumSatang(
          summary.map((bucket) => bucket.outstandingSatang),
          'ยอดค้างของบริษัท',
        ),
        batchCount: summary.reduce((sum, bucket) => sum + bucket.batchCount, 0),
        byBucket: summary.map((bucket) => bucket.outstandingSatang),
        latestDueDate: latestDueDate(company.batches),
      }
    })
    // บริษัทที่ปิดยอดครบแล้วไม่ใช่ลูกหนี้ค้าง — ไม่อยู่ในรายงานอายุหนี้
    .filter((company) => company.outstandingSatang > 0)
    .sort((a, b) => b.outstandingSatang - a.outstandingSatang || a.companyName.localeCompare(b.companyName, 'th'))

  const columns: readonly ReportColumn[] = [
    { key: 'company', header: 'บริษัทไฟแนนซ์', type: 'text', width: 28 },
    { key: 'outstandingSatang', header: 'ยอดรวมค้าง', type: 'money' },
    ...labels.map((label, index) => ({
      key: bucketKey(index),
      header: label,
      type: 'money' as const,
      tone: agingColumnTone(buckets, index),
    })),
    { key: 'batchCount', header: 'จำนวนรอบวางบิล', type: 'number' },
    { key: 'latestDueDate', header: 'วันครบกำหนดล่าสุด', type: 'date' },
  ]

  const bucketCells = (values: readonly number[]): Record<string, number> => {
    const cells: Record<string, number> = {}
    for (const [index] of labels.entries()) cells[bucketKey(index)] = values[index] ?? 0
    return cells
  }

  const rows: ReportRow[] = aging.map((company) => ({
    [ROW_KEY]: company.companyId,
    company: company.companyName,
    outstandingSatang: company.outstandingSatang,
    ...bucketCells(company.byBucket),
    batchCount: company.batchCount,
    latestDueDate: company.latestDueDate,
  }))

  const totalsByBucket = labels.map((_, index) =>
    sumSatang(
      aging.map((company) => company.byBucket[index] ?? 0),
      'ยอดค้างตามช่วงอายุ',
    ),
  )
  const totalOutstanding = sumSatang(totalsByBucket, 'ยอดค้างรับรวม')
  const over = (limit: number): number =>
    sumSatang(
      totalsByBucket.filter((_, index) => agingLowerBound(buckets, index) > limit),
      `ยอดค้างเกิน ${limit} วัน`,
    )

  return {
    columns,
    rows,
    kpis: [
      { key: 'outstanding', label: 'ยอดค้างรับรวม', value: totalOutstanding, type: 'money', higherIsBetter: false },
      {
        key: 'over60',
        label: `ค้างเกิน ${OVER_60} วัน`,
        value: over(OVER_60),
        type: 'money',
        hint: 'ควรติดตามด่วน',
        higherIsBetter: false,
      },
      {
        key: 'over90',
        label: `ค้างเกิน ${OVER_90} วัน`,
        value: over(OVER_90),
        type: 'money',
        hint: 'เสี่ยงเก็บไม่ได้',
        higherIsBetter: false,
      },
      { key: 'companyCount', label: 'บริษัทที่มียอดค้าง', value: aging.length, type: 'number', higherIsBetter: false },
    ],
    totalRow: {
      company: 'รวมทั้งหมด',
      outstandingSatang: totalOutstanding,
      ...bucketCells(totalsByBucket),
      batchCount: aging.reduce((sum, company) => sum + company.batchCount, 0),
      latestDueDate: null,
    },
    note:
      `อายุหนี้คำนวณ ณ วันที่ ${fmtDate(asOf)} จากวันครบกำหนดชำระของรอบวางบิล — นับเฉพาะบิลที่ส่งให้ลูกค้าแล้วและยังมียอดค้าง ` +
      '(ยอดที่ลูกค้าหักภาษี ณ ที่จ่ายไว้ถือว่าชำระแล้ว) · ช่วงอายุหนี้มาจากตั้งค่าการเงิน ไม่ใช่ค่าตายตัวในรายงาน',
  }
}

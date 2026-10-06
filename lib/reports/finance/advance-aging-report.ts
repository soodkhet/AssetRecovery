import { advanceStatusLabel } from '@/lib/advances/advance-ui'
import { advanceReturnOutstandingSatang } from '@/lib/finance/advance-offset-calc'
import { agingBucketIndex, daysOverdue } from '@/lib/finance/ar-calc'
import { sumSatang } from '@/lib/finance/satang'
import { fmtDate } from '@/lib/format/datetime'
import type { AdvanceStatus, PayoutBatchStatus } from '@/lib/generated/prisma/enums'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { toIsoDateOnly } from '@/lib/reports/period'
import { describeAgingBuckets } from '@/lib/settings/finance-policy'
import { toBangkokDayNumber } from '@/lib/settings/vat'

/**
 * **F5 — อายุเงินทดรองคงค้าง** (`96` §6-F5 · มติ PO 06/10/2569 U96 #18 — แทนรายงาน "เงินทดรองค้างเคลียร์" เดิม)
 * — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **คงค้าง = ยอดคืนค้าง** (`22` §6.14) = `return_satang` − ยอดที่ได้คืนแล้ว (แถว `advance_returns` ที่ยังไม่กลับรายการ)
 *   ผ่าน `advanceReturnOutstandingSatang()` ตัวเดียวกับหน้าเงินทดรอง ⇒ ตัวเลขสองหน้าจอตรงกัน
 *   · ยังไม่เคลียร์ ⇒ `return_satang` = ยอดอนุมัติ (ยังไม่บันทึกยอดใช้) ⇒ คงค้าง = ยอดอนุมัติ − ที่คืนแล้ว
 *   · เคลียร์แล้วแต่ยอดคืนยังไม่ปิด (มติ U30) ⇒ ยังอยู่ในรายงานจนกว่าจะรับคืนครบ
 * - **อายุ = วันนับจากวันจ่าย** (รอบจ่ายแรกที่โอนจริง `completed` — มติ U83 · วันที่ยึดวันสร้างไฟล์โอนแบบเดียวกับ
 *   ไฟล์ 04 ของ Export Pack) · ยังไม่เคยผ่านรอบจ่ายที่โอนแล้ว ⇒ นับจากวันอนุมัติ และช่อง "วันจ่าย" ว่าง
 * - **ช่วงอายุ 0–30 / 31–60 / 61–90 / 90+ วัน** (ตามมติ) — จัดช่วงด้วย `agingBucketIndex()` ตัวเดียวกับ AR Aging
 * - **เกินกำหนดเคลียร์** = ยังไม่เคลียร์ และเลยวันครบกำหนดแล้ว — **ครบกำหนดวันนี้ยังไม่เกิน** (`96` §14 · เริ่มนับวันถัดไป)
 *   ตัดสินจากวันครบกำหนดจริง ไม่ใช่สถานะที่ job เขียนไว้ ⇒ รายการที่ยัง `approved` ไม่หาย (`96` §13)
 */

/** ช่วงอายุตามมติ U96 #18 — ขอบบนของแต่ละช่วง (ช่วงสุดท้าย = เกิน 90 วัน) */
export const ADVANCE_AGING_BUCKETS: readonly number[] = [30, 60, 90]

export const ADVANCE_AGING_GROUP_BYS = ['advance', 'payee'] as const
export type AdvanceAgingGroupBy = (typeof ADVANCE_AGING_GROUP_BYS)[number]

export const ADVANCE_AGING_GROUP_BY_LABEL: Readonly<Record<AdvanceAgingGroupBy, string>> = {
  advance: 'รายใบ',
  payee: 'รายพนักงาน',
}

/** สถานะที่ยังถือเงินบริษัทอยู่ได้ — `cleared` อยู่ได้เมื่อยอดคืนยังไม่ปิด */
export const ADVANCE_AGING_STATUSES: readonly AdvanceStatus[] = ['approved', 'overdue', 'cleared']

/** สถานะที่ "ยังไม่เคลียร์" — นับเกินกำหนดเคลียร์ได้เฉพาะกลุ่มนี้ (`overdue` เกิดจาก job เท่านั้น — `15` §10) */
const UNCLEARED: readonly AdvanceStatus[] = ['approved', 'overdue']

/** รอบจ่ายที่เงินทดรองถูกดึงเข้า (ทุกแถวของ `payout_batch_items.advance_id`) */
export interface AdvanceAgingPayoutBatch {
  status: PayoutBatchStatus
  paymentFileGeneratedAt: Date | null
  updatedAt: Date
}

/** เงินทดรอง 1 ใบ (ยอดจาก DB ตรง ๆ — ห้ามคำนวณก่อนส่งเข้ามา) */
export interface AdvanceAgingEntry {
  advanceId: string
  /** เลขที่ใบเบิกเงินทดรอง (`advances.advance_number`) */
  advanceNumber: string
  payeeId: string
  payeeName: string
  teamName: string | null
  status: AdvanceStatus
  approvedAt: Date | null
  /** คอลัมน์ `DATE` */
  dueClearDate: Date
  /** ยอดอนุมัติจริง — `null` ไม่ควรเกิดกับรายการที่อนุมัติแล้ว */
  approvedSatang: number | null
  usedSatang: number
  /** `advances.return_satang` (generated column — `22` §6.13) */
  returnSatang: number
  /** ยอดของแถว `advance_returns` ที่ยังไม่กลับรายการ */
  collectedSatang: readonly number[]
  payoutBatches: readonly AdvanceAgingPayoutBatch[]
}

/**
 * วันจ่ายเงินทดรอง = รอบจ่ายแรกที่โอนจริง (`completed` — มติ U83) · วันที่ = วันสร้างไฟล์โอน
 * (ไม่มี ⇒ เวลาแก้ไขล่าสุดของรอบ — กติกาเดียวกับ `04_Payments.csv`) · ไม่เคยโอน ⇒ `null`
 */
export function advancePaidAt(batches: readonly AdvanceAgingPayoutBatch[]): Date | null {
  const times = batches
    .filter((batch) => batch.status === 'completed')
    .map((batch) => (batch.paymentFileGeneratedAt ?? batch.updatedAt).getTime())
  return times.length === 0 ? null : new Date(Math.min(...times))
}

/** อายุ (วัน) ตามปฏิทินไทย จากวันจ่าย (หรือวันอนุมัติเมื่อยังไม่จ่าย) ถึงวันดูรายงาน — ไม่ติดลบ */
export function advanceAgeDays(since: Date, asOf: Date): number {
  return Math.max(0, toBangkokDayNumber(asOf) - toBangkokDayNumber(since))
}

/** เกินกำหนดเคลียร์หรือไม่ — ครบกำหนดวันนี้ยังไม่เกิน (`96` §14) · เคลียร์แล้ว = ไม่นับ */
export function isAdvanceClearOverdue(entry: Pick<AdvanceAgingEntry, 'status' | 'dueClearDate'>, asOf: Date): boolean {
  return UNCLEARED.includes(entry.status) && daysOverdue(entry.dueClearDate, asOf) > 0
}

export interface AdvanceAgingLine {
  advanceId: string
  advanceNumber: string
  payeeId: string
  payeeName: string
  teamName: string | null
  status: AdvanceStatus
  paidAt: Date | null
  dueClearDate: Date
  approvedSatang: number
  usedSatang: number
  returnedSatang: number
  outstandingSatang: number
  ageDays: number
  bucketIndex: number
  overdueDays: number | null
}

/**
 * คำนวณรายใบ — คืนเฉพาะใบที่ยังมียอดคงค้าง (> 0) · ใบที่ไม่มีวันจ่ายและไม่มีวันอนุมัติข้าม (ข้อมูลไม่ครบ ไม่ควรเกิด)
 * เรียงอายุมากสุดก่อน (คนอ่านต้องเห็นตัวที่แย่ที่สุดก่อน)
 */
export function advanceAgingLines(entries: readonly AdvanceAgingEntry[], asOf: Date): AdvanceAgingLine[] {
  const lines: AdvanceAgingLine[] = []
  for (const entry of entries) {
    if (!ADVANCE_AGING_STATUSES.includes(entry.status)) continue
    const outstanding = advanceReturnOutstandingSatang({
      returnSatang: entry.returnSatang,
      collectedSatang: entry.collectedSatang,
    })
    if (outstanding <= 0) continue
    const paidAt = advancePaidAt(entry.payoutBatches)
    const since = paidAt ?? entry.approvedAt
    // จ่าย/อนุมัติหลังวันดูรายงาน (ดูย้อนหลัง) ⇒ ยังไม่ใช่เงินคงค้าง ณ วันนั้น
    if (since === null || toBangkokDayNumber(since) > toBangkokDayNumber(asOf)) continue
    const ageDays = advanceAgeDays(since, asOf)
    const overdue = isAdvanceClearOverdue(entry, asOf)
    lines.push({
      advanceId: entry.advanceId,
      advanceNumber: entry.advanceNumber,
      payeeId: entry.payeeId,
      payeeName: entry.payeeName,
      teamName: entry.teamName,
      status: entry.status,
      paidAt,
      dueClearDate: entry.dueClearDate,
      approvedSatang: entry.approvedSatang ?? 0,
      usedSatang: entry.usedSatang,
      returnedSatang: entry.returnSatang - outstanding,
      outstandingSatang: outstanding,
      ageDays,
      bucketIndex: agingBucketIndex(ageDays, ADVANCE_AGING_BUCKETS),
      overdueDays: overdue ? daysOverdue(entry.dueClearDate, asOf) : null,
    })
  }
  return lines.sort((a, b) => b.ageDays - a.ageDays || a.payeeName.localeCompare(b.payeeName, 'th'))
}

/** ป้ายสถานะของแถว — เคลียร์แล้วแต่ยังมียอดค้าง = รอรับคืน · ยังไม่เคลียร์และเลยกำหนด = เกินกำหนดเคลียร์ */
export function advanceAgingStatusLabel(line: Pick<AdvanceAgingLine, 'status' | 'overdueDays'>): string {
  if (line.status === 'cleared') return `${advanceStatusLabel('cleared')} — รอรับคืนยอดคงเหลือ`
  if (line.overdueDays !== null) return `เกินกำหนดเคลียร์ ${line.overdueDays.toLocaleString('th-TH')} วัน`
  return advanceStatusLabel(line.status)
}

const BUCKET_LABELS = describeAgingBuckets(ADVANCE_AGING_BUCKETS)

function bucketKey(index: number): string {
  return `bucket${index}`
}

/** ช่วงที่เกิน 60 วัน = เหลือง · เกิน 90 วัน = แดง (แนวเดียวกับ AR Aging) */
function bucketTone(index: number): 'default' | 'warning' | 'danger' {
  if (index >= 3) return 'danger'
  if (index === 2) return 'warning'
  return 'default'
}

const ADVANCE_COLUMNS: readonly ReportColumn[] = [
  { key: 'payeeName', header: 'พนักงาน', type: 'text', width: 24 },
  { key: 'teamName', header: 'ทีม', type: 'text', width: 18 },
  { key: 'ref', header: 'เลขที่', type: 'text', width: 14 },
  { key: 'paidAt', header: 'วันจ่าย', type: 'date' },
  { key: 'dueClearDate', header: 'กำหนดเคลียร์', type: 'date' },
  { key: 'approvedSatang', header: 'ยอดจ่าย', type: 'money' },
  { key: 'usedSatang', header: 'ใช้แล้ว', type: 'money' },
  { key: 'returnedSatang', header: 'คืนแล้ว', type: 'money' },
  { key: 'outstandingSatang', header: 'คงค้าง', type: 'money' },
  { key: 'ageDays', header: 'อายุ (วัน)', type: 'number' },
  { key: 'bucketLabel', header: 'ช่วงอายุ', type: 'text', width: 12 },
  { key: 'statusLabel', header: 'สถานะ', type: 'text', width: 28 },
]

function payeeColumns(): readonly ReportColumn[] {
  return [
    { key: 'payeeName', header: 'พนักงาน', type: 'text', width: 24 },
    { key: 'teamName', header: 'ทีม', type: 'text', width: 18 },
    { key: 'advanceCount', header: 'จำนวนใบ', type: 'number' },
    { key: 'approvedSatang', header: 'ยอดจ่าย', type: 'money' },
    { key: 'usedSatang', header: 'ใช้แล้ว', type: 'money' },
    { key: 'returnedSatang', header: 'คืนแล้ว', type: 'money' },
    { key: 'outstandingSatang', header: 'คงค้าง', type: 'money' },
    ...BUCKET_LABELS.map(
      (label, index): ReportColumn => ({ key: bucketKey(index), header: label, type: 'money', tone: bucketTone(index) }),
    ),
    { key: 'overdueCount', header: 'ใบเกินกำหนดเคลียร์', type: 'number', tone: 'danger' },
    { key: 'maxAgeDays', header: 'อายุสูงสุด (วัน)', type: 'number' },
  ]
}

function sumOf(lines: readonly AdvanceAgingLine[], pick: (line: AdvanceAgingLine) => number, label: string): number {
  return sumSatang(lines.map(pick), label)
}

function bucketTotals(lines: readonly AdvanceAgingLine[]): number[] {
  return BUCKET_LABELS.map((_, index) =>
    sumOf(
      lines.filter((line) => line.bucketIndex === index),
      (line) => line.outstandingSatang,
      'ยอดคงค้างตามช่วงอายุ',
    ),
  )
}

function advanceRows(lines: readonly AdvanceAgingLine[]): ReportRow[] {
  return lines.map((line) => ({
    [ROW_KEY]: line.advanceId,
    payeeName: line.payeeName,
    teamName: line.teamName,
    ref: line.advanceNumber,
    paidAt: line.paidAt === null ? null : line.paidAt.toISOString(),
    dueClearDate: toIsoDateOnly(line.dueClearDate),
    approvedSatang: line.approvedSatang,
    usedSatang: line.usedSatang,
    returnedSatang: line.returnedSatang,
    outstandingSatang: line.outstandingSatang,
    ageDays: line.ageDays,
    bucketLabel: BUCKET_LABELS[line.bucketIndex] ?? null,
    statusLabel: advanceAgingStatusLabel(line),
  }))
}

function payeeRows(lines: readonly AdvanceAgingLine[]): ReportRow[] {
  const byPayee = new Map<string, AdvanceAgingLine[]>()
  for (const line of lines) byPayee.set(line.payeeId, [...(byPayee.get(line.payeeId) ?? []), line])
  return [...byPayee.entries()]
    .map(([payeeId, group]) => {
      const first = group[0]
      const buckets = bucketTotals(group)
      const maxAgeDays = Math.max(...group.map((line) => line.ageDays))
      return {
        maxAgeDays,
        row: {
          [ROW_KEY]: payeeId,
          payeeName: first?.payeeName ?? null,
          teamName: first?.teamName ?? null,
          advanceCount: group.length,
          approvedSatang: sumOf(group, (line) => line.approvedSatang, 'ยอดจ่าย'),
          usedSatang: sumOf(group, (line) => line.usedSatang, 'ยอดใช้แล้ว'),
          returnedSatang: sumOf(group, (line) => line.returnedSatang, 'ยอดคืนแล้ว'),
          outstandingSatang: sumOf(group, (line) => line.outstandingSatang, 'ยอดคงค้าง'),
          ...Object.fromEntries(buckets.map((total, index) => [bucketKey(index), total])),
          overdueCount: group.filter((line) => line.overdueDays !== null).length,
          maxAgeDays,
        } satisfies ReportRow,
      }
    })
    .sort((a, b) => b.maxAgeDays - a.maxAgeDays)
    .map((entry) => entry.row)
}

export function buildAdvanceAgingReport(input: {
  advances: readonly AdvanceAgingEntry[]
  /** วันที่ดูรายงาน */
  asOf: Date
  groupBy: AdvanceAgingGroupBy
}): ReportData {
  const { asOf, groupBy } = input
  const lines = advanceAgingLines(input.advances, asOf)

  const totalOutstanding = sumOf(lines, (line) => line.outstandingSatang, 'ยอดคงค้างรวม')
  const overdueLines = lines.filter((line) => line.overdueDays !== null)
  const buckets = bucketTotals(lines)
  const totals = {
    approvedSatang: sumOf(lines, (line) => line.approvedSatang, 'ยอดจ่าย'),
    usedSatang: sumOf(lines, (line) => line.usedSatang, 'ยอดใช้แล้ว'),
    returnedSatang: sumOf(lines, (line) => line.returnedSatang, 'ยอดคืนแล้ว'),
    outstandingSatang: totalOutstanding,
  }

  const columns = groupBy === 'payee' ? payeeColumns() : ADVANCE_COLUMNS
  const rows = groupBy === 'payee' ? payeeRows(lines) : advanceRows(lines)

  const totalRow: ReportRow | null =
    rows.length === 0
      ? null
      : groupBy === 'payee'
        ? {
            payeeName: 'รวมทั้งหมด',
            teamName: null,
            advanceCount: lines.length,
            ...totals,
            ...Object.fromEntries(buckets.map((total, index) => [bucketKey(index), total])),
            overdueCount: overdueLines.length,
            maxAgeDays: null,
          }
        : {
            payeeName: 'รวมทั้งหมด',
            teamName: null,
            ref: null,
            paidAt: null,
            dueClearDate: null,
            ...totals,
            ageDays: null,
            bucketLabel: null,
            statusLabel: null,
          }

  return {
    columns,
    rows,
    kpis: [
      {
        key: 'count',
        label: 'เงินทดรองคงค้าง',
        value: lines.length,
        type: 'number',
        hint: `${new Set(lines.map((line) => line.payeeId)).size.toLocaleString('th-TH')} คน`,
        higherIsBetter: false,
      },
      {
        key: 'amount',
        label: 'ยอดคงค้างรวม',
        value: totalOutstanding,
        type: 'money',
        hint: 'เงินบริษัทที่ยังอยู่กับผู้เบิก',
        higherIsBetter: false,
      },
      {
        key: 'overdueAmount',
        label: 'คงค้างเกินกำหนดเคลียร์',
        value: sumOf(overdueLines, (line) => line.outstandingSatang, 'ยอดคงค้างเกินกำหนด'),
        type: 'money',
        hint: `${overdueLines.length.toLocaleString('th-TH')} ใบ`,
        higherIsBetter: false,
      },
      {
        key: 'over90',
        label: `คงค้าง${BUCKET_LABELS.at(-1) ?? ''}`,
        value: buckets.at(-1) ?? 0,
        type: 'money',
        hint: 'ควรติดตามเป็นพิเศษ',
        higherIsBetter: false,
      },
    ],
    totalRow,
    note:
      `นับ ณ วันที่ ${fmtDate(asOf)} ตามปฏิทินไทย — คงค้าง = ยอดจ่าย − ยอดใช้ (เมื่อเคลียร์แล้ว) − ยอดที่ได้คืนแล้ว · ` +
      'อายุนับจากวันจ่าย (รอบจ่ายที่โอนแล้ว) ถ้ายังไม่ผ่านรอบจ่ายนับจากวันอนุมัติ · ' +
      'รายการที่ครบกำหนดเคลียร์วันนี้ยังไม่ถือว่าเกินกำหนด · พนักงานที่ยังมีรายการไม่เคลียร์จะขอเบิกเงินทดรองรายการใหม่ไม่ได้',
  }
}

import { sumSatang } from '@/lib/finance/satang'
import type { WhtFilingStatus } from '@/lib/generated/prisma/enums'
import { WHT_FILING_METHOD_SUFFIX, type WhtFilingMethod } from '@/lib/settings/wht-policy'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { toIsoDateOnly } from '@/lib/reports/period'
import { comparePeriodKeys } from '@/lib/reports/accounting/period-window'
import { fmtDate } from '@/lib/format/datetime'
import { filingNominalDueDateOf, isFilingOverdue, WHT_FILING_STATUS_LABEL } from '@/lib/wht/wht'

/**
 * **A1 — สรุป WHT รายเดือน** (`96` §6-A1) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - ยอดมาจาก `wht_filing_summaries` (`96` §7) ซึ่ง 4.5 คำนวณไว้แล้วโดย**ไม่นับใบที่ `cancelled`**
 *   (`33` §9/§16 — ทุกจุดที่ยกเลิกใบเรียก `refreshFilingSummary()` ทันที) ⇒ รายงานนี้ห้ามรวมยอด
 *   จากใบ 50 ทวิ เองซ้ำอีกชั้น มิฉะนั้นใบที่ยกเลิกจะกลับมาโผล่ในยอด
 * - **เลยกำหนดยื่น = เตือน ไม่บล็อก** (`24` §6.8 `FILING_OVERDUE_WARNING`) — สถานะจริงในสคีมามีแค่
 *   `pending`/`filed` ⇒ "เลยกำหนด" เป็นข้อความประกอบของสถานะ `pending` เท่านั้น ห้ามสร้างสถานะใหม่
 * - รวม WHT = ภ.ง.ด.3 + ภ.ง.ด.53 (บุคคลธรรมดา + นิติบุคคล) — ไม่มีแบบที่สาม (`33` §7.2)
 */

/** 1 แถว = 1 รอบนำส่ง (`wht_filing_summaries` + งวดบัญชีของมัน) */
export interface WhtFilingSummaryEntry {
  periodId: string
  periodLabel: string
  yearBe: number
  month: number
  /** วันครบกำหนดนำส่ง (คอลัมน์ `DATE`) */
  filingDueDate: Date
  pnd3Satang: number
  pnd53Satang: number
  /** ภ.ง.ด.1 — เงินได้ 40(2) (มติ PO 05/10/2569 UAT U7) */
  pnd1Satang: number
  status: WhtFilingStatus
  /** วิธียื่นที่ใช้คิดกำหนด (มติ PO U45) — ไม่ระบุ = ออนไลน์ */
  filingMethod?: WhtFilingMethod
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'period', header: 'รอบเดือน', type: 'text', width: 22 },
  { key: 'pnd3Satang', header: 'ภ.ง.ด.3', type: 'money' },
  { key: 'pnd53Satang', header: 'ภ.ง.ด.53', type: 'money' },
  { key: 'pnd1Satang', header: 'ภ.ง.ด.1', type: 'money' },
  { key: 'totalSatang', header: 'รวม WHT', type: 'money' },
  { key: 'filingDueDate', header: 'กำหนดยื่น', type: 'date' },
  { key: 'filingMethodLabel', header: 'วิธียื่น', type: 'text', width: 30 },
  { key: 'statusLabel', header: 'สถานะ', type: 'text', width: 20 },
]

/**
 * ป้ายวิธียื่นบนรายงาน — กำหนดยื่นที่ถูกเลื่อนเพราะตรงวันหยุด/เสาร์-อาทิตย์ (มติ PO U93) ต่อท้ายวันเดิมตามปฏิทิน
 * ให้เห็นว่าคอลัมน์ "กำหนดยื่น" เป็นวันที่เลื่อนแล้ว เช่น "(ยื่นออนไลน์) เลื่อนจากวันหยุด 15/11/2569"
 */
export function filingMethodText(entry: WhtFilingSummaryEntry): string {
  const method = entry.filingMethod ?? 'online'
  const base = WHT_FILING_METHOD_SUFFIX[method]
  const nominal = filingNominalDueDateOf({ yearBe: entry.yearBe, month: entry.month }, method)
  return nominal.getTime() === entry.filingDueDate.getTime() ? base : `${base} เลื่อนจากวันหยุด ${fmtDate(nominal)}`
}

/** ป้ายสถานะบนรายงาน — ยื่นแล้ว / รอยื่น / รอยื่น (เลยกำหนด) */
export function filingStatusLabel(entry: WhtFilingSummaryEntry, asOf: Date): string {
  const base = WHT_FILING_STATUS_LABEL[entry.status]
  return isFilingOverdue(entry.status, entry.filingDueDate, asOf) ? `${base} (เลยกำหนด)` : base
}

export function buildWhtSummaryReport(input: {
  filings: readonly WhtFilingSummaryEntry[]
  /** วันที่ดูรายงาน — ใช้ตัดสินว่ารอบไหนเลยกำหนดยื่นแล้ว */
  asOf: Date
}): ReportData {
  const { filings, asOf } = input

  // เรียงจากงวดเก่าไปใหม่ (อ่านเป็นไทม์ไลน์การนำส่งเหมือนหน้ารายงานในเอกสาร)
  const sorted = [...filings].sort((a, b) => comparePeriodKeys(a, b))

  const rows: ReportRow[] = sorted.map((entry) => ({
    [ROW_KEY]: entry.periodId,
    period: entry.periodLabel,
    pnd3Satang: entry.pnd3Satang,
    pnd53Satang: entry.pnd53Satang,
    pnd1Satang: entry.pnd1Satang,
    totalSatang: entry.pnd3Satang + entry.pnd53Satang + entry.pnd1Satang,
    filingDueDate: toIsoDateOnly(entry.filingDueDate),
    filingMethodLabel: filingMethodText(entry),
    statusLabel: filingStatusLabel(entry, asOf),
  }))

  const pnd3Total = sumSatang(sorted.map((entry) => entry.pnd3Satang), 'ภ.ง.ด.3 รวม')
  const pnd53Total = sumSatang(sorted.map((entry) => entry.pnd53Satang), 'ภ.ง.ด.53 รวม')
  const pnd1Total = sumSatang(sorted.map((entry) => entry.pnd1Satang), 'ภ.ง.ด.1 รวม')
  const grandTotal = pnd3Total + pnd53Total + pnd1Total
  const pending = sorted.filter((entry) => entry.status === 'pending')
  const overdue = pending.filter((entry) => isFilingOverdue(entry.status, entry.filingDueDate, asOf))

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      { key: 'pnd3', label: 'ภ.ง.ด.3 (บุคคลธรรมดา)', value: pnd3Total, type: 'money' },
      { key: 'pnd53', label: 'ภ.ง.ด.53 (นิติบุคคล)', value: pnd53Total, type: 'money' },
      { key: 'pnd1', label: 'ภ.ง.ด.1 (เงินได้ 40(1)/40(2))', value: pnd1Total, type: 'money' },
      {
        key: 'total',
        label: 'รวม WHT',
        value: grandTotal,
        type: 'money',
        hint: `${sorted.length.toLocaleString('th-TH')} รอบนำส่ง`,
      },
      {
        key: 'pending',
        label: 'รอยื่น',
        value: pending.length,
        type: 'number',
        hint: overdue.length === 0 ? 'ยังไม่มีรอบที่เลยกำหนด' : `เลยกำหนดแล้ว ${overdue.length.toLocaleString('th-TH')} รอบ`,
        higherIsBetter: false,
      },
    ],
    totalRow:
      rows.length === 0
        ? null
        : {
            period: 'รวมทั้งหมด',
            pnd3Satang: pnd3Total,
            pnd53Satang: pnd53Total,
            pnd1Satang: pnd1Total,
            totalSatang: grandTotal,
            filingDueDate: null,
            filingMethodLabel: null,
            statusLabel: null,
          },
    note:
      'ยอดมาจากสรุปรอบนำส่ง WHT — ใบ 50 ทวิ ที่ถูกยกเลิกไม่ถูกนับในยอดทุกแบบ · ' +
      'รอบที่เลยกำหนดยื่นเป็นการเตือน ไม่บล็อกการทำงาน — ' +
      'เอกสารยื่นจริงออกโดยสำนักงานบัญชีนอกระบบ',
  }
}

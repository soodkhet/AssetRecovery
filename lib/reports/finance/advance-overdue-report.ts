import { advanceStatusLabel } from '@/lib/advances/advance-ui'
import { daysOverdue } from '@/lib/finance/ar-calc'
import { sumSatang } from '@/lib/finance/satang'
import type { AdvanceStatus } from '@/lib/generated/prisma/enums'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { toIsoDateOnly } from '@/lib/reports/period'

/**
 * **F5 — เงินทดรองค้างเคลียร์** (`96` §6-F5) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **ครบกำหนด "วันนี้" ยังไม่ถือว่าเกินกำหนด** (`96` §14) — เริ่มนับตั้งแต่วันถัดไป
 *   ⇒ เข้ารายงานเมื่อ `daysOverdue > 0` เท่านั้น (ตัวนับวันเป็นตัวเดียวกับ AR Aging — `22` §6.11)
 * - **ยอด = ยอดที่อนุมัติจริง** (เงินที่ออกจากบริษัทไปแล้ว) ไม่ใช่ยอดที่ขอเบิก — แนวเดียวกับ
 *   `outstandingAdvanceSatang()` ของหน้าเงินทดรอง (`15` §8) ⇒ ตัวเลขสองหน้าจอตรงกัน
 * - **ไม่หาย ไม่ซ้ำ** (`96` §13) — รายการที่ job ยังไม่ได้พลิกเป็น `overdue` (สถานะยัง `approved`)
 *   ต้องอยู่ในรายงานด้วย เพราะรายงานตัดสินจากวันครบกำหนดจริง ไม่ใช่จากสถานะที่ job เขียนไว้
 */

/** เงินทดรอง 1 รายการที่ยังไม่เคลียร์ */
export interface AdvanceOverdueEntry {
  advanceId: string
  payeeName: string
  teamName: string | null
  status: AdvanceStatus
  /** วันที่อนุมัติ (instant) — `null` = ยังไม่มีข้อมูล */
  approvedAt: Date | null
  /** วันครบกำหนดเคลียร์ (คอลัมน์ `DATE`) */
  dueClearDate: Date
  /** ยอดที่อนุมัติจริง — `null` ไม่ควรเกิดกับรายการที่อนุมัติแล้ว (กันไว้ไม่ให้ยอดรวมเป็น NaN) */
  approvedSatang: number | null
  purpose: string
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'payeeName', header: 'พนักงาน', type: 'text', width: 24 },
  { key: 'teamName', header: 'ทีม', type: 'text', width: 20 },
  { key: 'approvedAt', header: 'วันที่อนุมัติ', type: 'date' },
  { key: 'dueClearDate', header: 'กำหนดเคลียร์', type: 'date' },
  { key: 'amountSatang', header: 'ยอด', type: 'money' },
  { key: 'overdueDays', header: 'เกินกำหนด (วัน)', type: 'number', tone: 'danger' },
  { key: 'purpose', header: 'วัตถุประสงค์', type: 'text', width: 30 },
  { key: 'statusLabel', header: 'สถานะ', type: 'text', width: 22 },
]

/** `96` §14 — ครบกำหนดวันนี้ยังไม่เกินกำหนด (เริ่มนับวันถัดไป) */
export function isAdvanceOverdue(dueClearDate: Date, asOf: Date): boolean {
  return daysOverdue(dueClearDate, asOf) > 0
}

export function buildAdvanceOverdueReport(input: {
  advances: readonly AdvanceOverdueEntry[]
  /** วันที่ดูรายงาน */
  asOf: Date
}): ReportData {
  const { advances, asOf } = input

  const overdue = advances
    .filter((advance) => isAdvanceOverdue(advance.dueClearDate, asOf))
    .map((advance) => ({ ...advance, overdueDays: daysOverdue(advance.dueClearDate, asOf) }))
    // ค้างนานสุดอยู่บนสุด — คนอ่านรายงานต้องเห็นตัวที่แย่ที่สุดก่อน
    .sort((a, b) => b.overdueDays - a.overdueDays || a.payeeName.localeCompare(b.payeeName, 'th'))

  const rows: ReportRow[] = overdue.map((advance) => ({
    [ROW_KEY]: advance.advanceId,
    payeeName: advance.payeeName,
    teamName: advance.teamName,
    approvedAt: advance.approvedAt === null ? null : advance.approvedAt.toISOString(),
    dueClearDate: toIsoDateOnly(advance.dueClearDate),
    amountSatang: advance.approvedSatang ?? 0,
    overdueDays: advance.overdueDays,
    purpose: advance.purpose,
    statusLabel: advanceStatusLabel(advance.status),
  }))

  const totalSatang = sumSatang(
    overdue.map((advance) => advance.approvedSatang ?? 0),
    'ยอดเงินทดรองค้างรวม',
  )
  const longest = overdue[0]?.overdueDays ?? null

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'count',
        label: 'รายการค้างเคลียร์',
        value: overdue.length,
        type: 'number',
        hint: `${new Set(overdue.map((advance) => advance.payeeName)).size.toLocaleString('th-TH')} คน`,
        higherIsBetter: false,
      },
      {
        key: 'amount',
        label: 'ยอดรวมค้างเคลียร์',
        value: totalSatang,
        type: 'money',
        hint: 'เงินบริษัทที่ยังอยู่กับผู้เบิก',
        higherIsBetter: false,
      },
      {
        key: 'longest',
        label: 'ค้างนานที่สุด',
        value: longest,
        type: 'number',
        hint: 'วัน',
        higherIsBetter: false,
      },
    ],
    totalRow:
      rows.length === 0
        ? null
        : {
            payeeName: 'รวมทั้งหมด',
            teamName: null,
            approvedAt: null,
            dueClearDate: null,
            amountSatang: totalSatang,
            overdueDays: null,
            purpose: null,
            statusLabel: null,
          },
    note:
      `นับ ณ วันที่ ${toIsoDateOnly(asOf)} ตามปฏิทินไทย — รายการที่ครบกำหนดวันนี้ยังไม่ถือว่าเกินกำหนด (เริ่มนับวันถัดไป) · ` +
      'ยอดคือยอดที่อนุมัติจริง · พนักงานที่ยังมีรายการค้างจะขอเบิกเงินทดรองรายการใหม่ไม่ได้จนกว่าจะเคลียร์ (ไฟล์ 15)',
  }
}

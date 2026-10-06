import { advanceReturnOutstandingSatang } from '@/lib/finance/advance-offset-calc'
import { sumSatang } from '@/lib/finance/satang'
import type { AdvanceReturnChannel, AdvanceStatus } from '@/lib/generated/prisma/enums'
import { advancePaidAt, type AdvanceAgingPayoutBatch } from '@/lib/reports/finance/advance-aging-report'
import type { AdvanceBalanceExportRow } from '@/lib/exports/pack'
import { toBangkokDayNumber } from '@/lib/settings/vat'

/**
 * `16_Advance_Balance.csv` (มติ PO 06/10/2569 U94 ข้อ 3) — เงินทดรองต่อคน ยอดยกมา/เคลื่อนไหว/คงเหลือ
 * — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### นิยาม (ไม่คิดสูตรซ้ำ — ใช้ของเดิมทั้งหมด)
 * ยอดคงค้างของเงินทดรอง 1 ใบ **ณ ต้นวัน D** (ตามปฏิทินไทย) =
 *   `จ่ายแล้ว(D) − ใช้/เคลียร์แล้ว(D) − รับคืนแล้ว(D)`
 * - **จ่าย** = ยอดอนุมัติ เมื่อวันจ่าย < D · วันจ่าย = `advancePaidAt()` ของรายงานอายุเงินทดรอง (รอบจ่ายแรกที่
 *   `completed` · วันสร้างไฟล์โอน — กติกาเดียวกับไฟล์ 04)
 * - **ใช้/เคลียร์** = ยอดอนุมัติ − `return_satang` (`22` §6.13 — generated column = `max(0, อนุมัติ − ใช้จริง)`)
 *   เมื่อวันเคลียร์ (`cleared_at`) < D
 * - **รับคืน** = แถว `advance_returns` ที่มีผลก่อน D และยังไม่กลับรายการ ณ D · วันที่มีผล: หักกลบ = วันจ่ายของรอบ
 *   (เฉพาะรอบที่ `completed` — ตัวเดียวกับไฟล์ 13) · เงินสด/โอน = `received_date`
 * - ใบที่จ่ายและเคลียร์แล้ว ⇒ คงค้าง = `advanceReturnOutstandingSatang()` (`22` §6.14) ตรงตัว (มี guard รับคืนเกิน)
 *
 * ⇒ `ยกมา = คงค้าง(ต้นงวด)` · `คงเหลือ = คงค้าง(สิ้นงวด)` · การเคลื่อนไหวในงวด = ผลต่างของแต่ละองค์ประกอบ
 * ⇒ `ยกมา + จ่าย − ใช้/เคลียร์ − คืนหักกลบ − คืนรับแยก = คงเหลือ` **ทุกแถวโดยโครงสร้าง**
 * (กลับรายการรับคืนของงวดก่อนในงวดนี้ ⇒ ยอดคืนในงวดติดลบได้ — เป็นข้อมูลจริง ไม่ปัด)
 */

export interface AdvanceBalanceReturn {
  channel: AdvanceReturnChannel
  amountSatang: number
  /** คอลัมน์ `DATE` — ใช้กับเงินสด/โอน */
  receivedDate: Date | null
  /** รอบจ่ายที่หักกลบ (ช่องทาง `payout_offset`) */
  payoutBatch: AdvanceAgingPayoutBatch | null
  reversedAt: Date | null
}

export interface AdvanceBalanceEntry {
  advanceId: string
  /** เลขที่ใบเบิกเงินทดรอง (`advances.advance_number` — มติ PO U102) */
  advanceNumber: string
  payeeId: string
  payeeName: string
  payeeTaxId: string | null
  status: AdvanceStatus
  approvedSatang: number | null
  /** `advances.return_satang` (generated column) */
  returnSatang: number
  clearedAt: Date | null
  payoutBatches: readonly AdvanceAgingPayoutBatch[]
  returns: readonly AdvanceBalanceReturn[]
}

/** สถานะที่เคยจ่ายเงินออกได้ — `pending_approval`/`rejected` ไม่มีเงินออก */
const BALANCE_STATUSES: readonly AdvanceStatus[] = ['approved', 'overdue', 'cleared']

/** วันที่มีผลของการรับคืน (เลขวันไทย) — หักกลบที่รอบยังไม่โอน ⇒ ยังไม่มีผล (`null`) */
function returnEffectiveDay(row: AdvanceBalanceReturn): number | null {
  if (row.channel === 'payout_offset') {
    if (row.payoutBatch === null || row.payoutBatch.status !== 'completed') return null
    return toBangkokDayNumber(row.payoutBatch.paymentFileGeneratedAt ?? row.payoutBatch.updatedAt)
  }
  return row.receivedDate === null ? null : toBangkokDayNumber(row.receivedDate)
}

interface Components {
  paid: number
  cleared: number
  returnedOffset: number
  returnedDirect: number
  balance: number
}

/** องค์ประกอบยอดของใบ ณ ต้นวัน `day` (เลขวันไทย — exclusive) */
function componentsAt(entry: AdvanceBalanceEntry, day: number): Components {
  const approved = entry.approvedSatang ?? 0
  const paidAt = advancePaidAt(entry.payoutBatches)
  const isPaid = paidAt !== null && toBangkokDayNumber(paidAt) < day
  const isCleared = entry.status === 'cleared' && entry.clearedAt !== null && toBangkokDayNumber(entry.clearedAt) < day

  const effective = entry.returns.filter((row) => {
    const effectiveDay = returnEffectiveDay(row)
    if (effectiveDay === null || effectiveDay >= day) return false
    return row.reversedAt === null || toBangkokDayNumber(row.reversedAt) >= day
  })
  const returnedOffset = sumSatang(
    effective.filter((row) => row.channel === 'payout_offset').map((row) => row.amountSatang),
    'รับคืนหักกลบ',
  )
  const returnedDirect = sumSatang(
    effective.filter((row) => row.channel !== 'payout_offset').map((row) => row.amountSatang),
    'รับคืนแยก',
  )

  const paid = isPaid ? approved : 0
  const cleared = isCleared ? approved - entry.returnSatang : 0
  const balance =
    isPaid && isCleared
      ? // `22` §6.14 ตรงตัว — ได้คืนเกินยอดคืน = ข้อมูลเพี้ยน ⇒ ดัง ไม่ใช่ปัด
        advanceReturnOutstandingSatang({
          returnSatang: entry.returnSatang,
          collectedSatang: effective.map((row) => row.amountSatang),
        })
      : paid - cleared - returnedOffset - returnedDirect
  return { paid, cleared, returnedOffset, returnedDirect, balance }
}

export interface AdvanceBalanceLine {
  advanceId: string
  openingSatang: number
  paidSatang: number
  clearedSatang: number
  returnedOffsetSatang: number
  returnedDirectSatang: number
  closingSatang: number
}

/** ยอดของใบเดียวในงวด `[start, end)` (วันที่ date-only UTC ของงวด) */
export function advanceBalanceLine(entry: AdvanceBalanceEntry, period: { start: Date; end: Date }): AdvanceBalanceLine {
  const startDay = toBangkokDayNumber(period.start)
  const endDay = toBangkokDayNumber(period.end)
  const open = componentsAt(entry, startDay)
  const close = componentsAt(entry, endDay)
  return {
    advanceId: entry.advanceId,
    openingSatang: open.balance,
    paidSatang: close.paid - open.paid,
    clearedSatang: close.cleared - open.cleared,
    returnedOffsetSatang: close.returnedOffset - open.returnedOffset,
    returnedDirectSatang: close.returnedDirect - open.returnedDirect,
    closingSatang: close.balance,
  }
}

function hasActivity(line: AdvanceBalanceLine): boolean {
  return (
    line.openingSatang !== 0 ||
    line.paidSatang !== 0 ||
    line.clearedSatang !== 0 ||
    line.returnedOffsetSatang !== 0 ||
    line.returnedDirectSatang !== 0 ||
    line.closingSatang !== 0
  )
}

/**
 * แถวของไฟล์ 16 — รวมต่อผู้รับเงิน (เฉพาะคนที่มียอดหรือเคลื่อนไหวในงวด) เรียงตามชื่อ ·
 * `advanceRefs` = ใบที่มียอด/เคลื่อนไหว เรียงตามเลขที่ (ไฟล์ซ้ำได้ผลเดิมทุกครั้ง)
 */
export function advanceBalanceRows(
  entries: readonly AdvanceBalanceEntry[],
  period: { start: Date; end: Date },
): AdvanceBalanceExportRow[] {
  const byPayee = new Map<string, AdvanceBalanceExportRow & { advanceRefs: string[] }>()
  for (const entry of entries) {
    if (!BALANCE_STATUSES.includes(entry.status)) continue
    const line = advanceBalanceLine(entry, period)
    if (!hasActivity(line)) continue
    const row = byPayee.get(entry.payeeId) ?? {
      payeeName: entry.payeeName,
      payeeTaxId: entry.payeeTaxId,
      openingSatang: 0,
      paidSatang: 0,
      clearedSatang: 0,
      returnedOffsetSatang: 0,
      returnedDirectSatang: 0,
      closingSatang: 0,
      advanceRefs: [],
    }
    row.openingSatang += line.openingSatang
    row.paidSatang += line.paidSatang
    row.clearedSatang += line.clearedSatang
    row.returnedOffsetSatang += line.returnedOffsetSatang
    row.returnedDirectSatang += line.returnedDirectSatang
    row.closingSatang += line.closingSatang
    row.advanceRefs.push(entry.advanceNumber)
    byPayee.set(entry.payeeId, row)
  }
  return [...byPayee.values()]
    .map((row) => ({ ...row, advanceRefs: [...row.advanceRefs].sort() }))
    .sort((a, b) => a.payeeName.localeCompare(b.payeeName, 'th'))
}

import { assertNonNegativeSatang, sumSatang } from '@/lib/finance/satang'

/**
 * เงินทดรองจ่าย — ยอดคืนค้าง + หักกลบในรอบจ่าย (`22` §6.14 · มติ PO 05/10/2569 UAT U30) — **pure ล้วน ไม่มี I/O**
 *
 * - **ยอดค้าง** = `return_satang` − ยอดที่ได้คืนแล้ว (แถว `advance_returns` ที่ยังไม่กลับรายการ) — ไม่ติดลบ
 *   (ได้คืนเกินยอดคืน = ข้อมูลเพี้ยน ⇒ ต้องดัง ไม่ใช่ปัดเป็น 0)
 * - **หักกลบ** ทำ**หลังคำนวณ WHT** ⇒ ฐาน WHT / 50 ทวิ / `gross`·`wht`·`net` ของรายการไม่เปลี่ยน
 *   ยอดที่หักต่อบรรทัด ≤ `net` ของบรรทัดนั้น ⇒ ยอดโอนสุทธิไม่ติดลบ · ส่วนที่หักไม่หมดยกไปรอบถัดไป
 * - ลำดับการหัก: เงินทดรองที่เคลียร์ก่อนหักก่อน (FIFO ตามลำดับที่ผู้เรียกส่งมา) × บรรทัดในรอบตามลำดับในรอบ
 */

/** ยอดคืนค้างของเงินทดรอง 1 รายการ */
export function advanceReturnOutstandingSatang(input: {
  /** `advances.return_satang` (generated column) */
  returnSatang: number
  /** ยอดของแถว `advance_returns` ที่ยังไม่กลับรายการ */
  collectedSatang: readonly number[]
}): number {
  assertNonNegativeSatang(input.returnSatang, 'ยอดคืน')
  for (const amount of input.collectedSatang) assertNonNegativeSatang(amount, 'ยอดที่ได้คืนแล้ว')
  const collected = sumSatang(input.collectedSatang, 'ยอดที่ได้คืนแล้ว')
  if (collected > input.returnSatang) {
    throw new RangeError(`ยอดที่ได้คืนแล้ว ${collected} เกินยอดคืน ${input.returnSatang}`)
  }
  return input.returnSatang - collected
}

export interface OutstandingAdvanceReturn {
  advanceId: string
  /** ยอดค้างที่ยังหักได้ (`advanceReturnOutstandingSatang()`) */
  outstandingSatang: number
}

export interface AdvanceOffsetAllocation {
  advanceId: string
  /** ตำแหน่งบรรทัดใน `netSatang` ที่ส่งเข้ามา */
  lineIndex: number
  amountSatang: number
}

export interface PayeeAdvanceOffset {
  /** แถวที่จะลง `advance_returns` (ช่องทาง `payout_offset`) — ยอด > 0 ทุกแถว */
  allocations: AdvanceOffsetAllocation[]
  /** ยอดหักต่อบรรทัด (ยาวเท่า `netSatang`) → `payout_batch_items.advance_offset_satang` */
  lineOffsetSatang: number[]
  /** ยอดโอนต่อบรรทัด = net − ยอดหัก (ไม่ติดลบ) */
  lineTransferSatang: number[]
  totalOffsetSatang: number
  /** ยอดค้างที่เหลือยกไปรอบถัดไป ต่อเงินทดรอง (ลำดับเดิม · รวมรายการที่เหลือ 0) */
  carriedForward: OutstandingAdvanceReturn[]
}

/**
 * หักยอดคืนค้างของผู้รับ 1 คนออกจากบรรทัดของเขาในรอบจ่าย (`22` §6.14)
 *
 * @param netSatang ยอดสุทธิหลัง WHT ของแต่ละบรรทัดของผู้รับคนนี้ในรอบ (ลำดับตามรอบจ่าย)
 * @param returns ยอดคืนค้างของผู้รับคนนี้ที่เลือกวิธี "หักกลบ" (ลำดับเคลียร์ก่อน-หลัง)
 *
 * ตัวอย่าง (มติ U30): คืนค้าง ฿550 รอบนี้ได้ ฿300 → หัก ฿300 โอน ฿0 ยก ฿250
 */
export function allocatePayeeAdvanceOffset(
  netSatang: readonly number[],
  returns: readonly OutstandingAdvanceReturn[],
): PayeeAdvanceOffset {
  netSatang.forEach((net, index) => assertNonNegativeSatang(net, `บรรทัดที่ ${index + 1}: ยอดสุทธิ`))
  const seen = new Set<string>()
  for (const entry of returns) {
    assertNonNegativeSatang(entry.outstandingSatang, `ยอดคืนค้างของ ${entry.advanceId}`)
    if (seen.has(entry.advanceId)) throw new RangeError(`เงินทดรอง ${entry.advanceId} ซ้ำในรายการยอดค้าง`)
    seen.add(entry.advanceId)
  }

  const remainingLine = [...netSatang]
  const allocations: AdvanceOffsetAllocation[] = []
  const carriedForward: OutstandingAdvanceReturn[] = []
  let lineCursor = 0

  for (const entry of returns) {
    let remaining = entry.outstandingSatang
    while (remaining > 0 && lineCursor < remainingLine.length) {
      const available = remainingLine[lineCursor] ?? 0
      if (available === 0) {
        lineCursor += 1
        continue
      }
      const take = Math.min(available, remaining)
      allocations.push({ advanceId: entry.advanceId, lineIndex: lineCursor, amountSatang: take })
      remainingLine[lineCursor] = available - take
      remaining -= take
    }
    carriedForward.push({ advanceId: entry.advanceId, outstandingSatang: remaining })
  }

  const lineOffsetSatang = netSatang.map((net, index) => net - (remainingLine[index] ?? 0))
  return {
    allocations,
    lineOffsetSatang,
    lineTransferSatang: remainingLine,
    totalOffsetSatang: sumSatang(lineOffsetSatang, 'ยอดหักคืนเงินทดรอง'),
    carriedForward,
  }
}

/**
 * ยอดโอนจริงของบรรทัด/รอบ = net − ยอดหักคืนเงินทดรอง − ยอดหักคืนยอดเรียกคืน (`22` §6.14 · staging E-014)
 * — ยามยอดหักรวมเกิน net (ยอดโอนติดลบไม่ได้)
 */
export function payoutTransferSatang(netSatang: number, advanceOffsetSatang: number, recoveryOffsetSatang = 0): number {
  assertNonNegativeSatang(netSatang, 'ยอดสุทธิ')
  assertNonNegativeSatang(advanceOffsetSatang, 'ยอดหักคืนเงินทดรอง')
  assertNonNegativeSatang(recoveryOffsetSatang, 'ยอดหักคืนยอดเรียกคืน')
  if (advanceOffsetSatang + recoveryOffsetSatang > netSatang) {
    throw new RangeError(`ยอดหักคืน ${advanceOffsetSatang + recoveryOffsetSatang} เกินยอดสุทธิ ${netSatang}`)
  }
  return netSatang - advanceOffsetSatang - recoveryOffsetSatang
}

/** staging E-014 — ยอดเรียกคืนค้าง = ยอดเรียกคืน − ยอดที่หักแล้ว (แถวที่ยังไม่กลับรายการ) · กติกาเดียวกับเงินทดรอง */
export function payeeRecoveryOutstandingSatang(input: { amountSatang: number; collectedSatang: readonly number[] }): number {
  return advanceReturnOutstandingSatang({ returnSatang: input.amountSatang, collectedSatang: input.collectedSatang })
}

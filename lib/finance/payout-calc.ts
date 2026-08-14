import { assertNonNegativeSatang, sumSatang } from '@/lib/finance/satang'

/**
 * ยอดรวมของรอบจ่ายเงิน (`22` §6.10 · `17` §6.2) — **pure ล้วน ไม่มี I/O**
 *
 * `net` ของ batch คิดจาก `gross - wht` ของ batch **เสมอ** (ไม่ใช่ SUM ของ net รายรายการ) — สองทาง
 * ต้องได้ค่าเท่ากันอยู่แล้วเพราะทุกรายการมี `net = gross - wht` แต่ถ้าไม่ตรงแปลว่ารายการใดรายการหนึ่ง
 * ถูกแก้ยอดมาผิด ⇒ ยามด้านล่างจับให้ก่อนเงินออกจริง
 */

export interface PayoutItemAmounts {
  grossSatang: number
  whtSatang: number
  netSatang: number
}

export interface PayoutBatchTotals {
  grossSatang: number
  whtSatang: number
  netSatang: number
  itemCount: number
}

/** `22` §6.10 — ยอดรวมของรอบจ่าย (`payout_batches.gross/wht/net_satang` + `item_count`) */
export function summarizePayoutBatch(items: readonly PayoutItemAmounts[]): PayoutBatchTotals {
  for (const [index, item] of items.entries()) {
    assertNonNegativeSatang(item.grossSatang, `รายการที่ ${index + 1}: ยอดก่อนหักภาษี`)
    assertNonNegativeSatang(item.whtSatang, `รายการที่ ${index + 1}: ภาษีหัก ณ ที่จ่าย`)
    if (item.netSatang !== item.grossSatang - item.whtSatang) {
      throw new RangeError(
        `รายการที่ ${index + 1}: ยอดสุทธิไม่เท่ากับ gross − wht (${item.netSatang} ≠ ${item.grossSatang} − ${item.whtSatang})`,
      )
    }
  }

  const grossSatang = sumSatang(items.map((item) => item.grossSatang), 'ยอดรวมก่อนหักภาษี')
  const whtSatang = sumSatang(items.map((item) => item.whtSatang), 'ยอดรวมภาษีหัก ณ ที่จ่าย')

  return {
    grossSatang,
    whtSatang,
    netSatang: grossSatang - whtSatang,
    itemCount: items.length,
  }
}

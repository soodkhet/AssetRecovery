import type { WhtCondition } from '@/lib/generated/prisma/enums'
import { isPayerBorneWhtCondition } from '@/lib/finance/wht-calc'

/**
 * staging E-054 (มติ PO 10/10/2569) — ยอดสะสมของผู้รับในรอบจ่ายก่อน ๆ ของเดือนปฏิทินเดียวกัน (ปฏิทินไทย)
 * สำหรับเกณฑ์ ฿1,000 แบบสะสมต่อเดือน (`calculatePayeeBatchWht({ monthToDate })` · `22` §6.9) — **pure ล้วน**
 *
 * - นับเฉพาะรายการค่าตอบแทนที่อยู่ในฐาน WHT หมวดที่มีเกณฑ์ (40(8)/Tax Profile) ของรอบที่ไม่ถูกยกเลิก
 * - ฐานของรายการ = เงินได้ก่อนภาษี (เงื่อนไข (2)/(3) `gross_satang` รวมภาษีที่ออกให้ ⇒ หักภาษีออก)
 * - "ยังไม่หัก" = รายการภาษี 0 (ต่ำกว่าเกณฑ์) ลบด้วยฐานที่เคยถูกยกไปหักแล้ว (`wht_carried_base_satang`)
 */
export interface MonthToDateItem {
  payeeId: string
  grossSatang: number
  whtSatang: number
  whtCarriedBaseSatang: number
  whtCondition: WhtCondition | null
}

export interface MonthToDate {
  priorBaseSatang: number
  priorUnwithheldBaseSatang: number
}

export function monthToDateByPayee(items: readonly MonthToDateItem[]): Map<string, MonthToDate> {
  const totals = new Map<string, { base: number; unwithheld: number; carried: number }>()
  for (const item of items) {
    const current = totals.get(item.payeeId) ?? { base: 0, unwithheld: 0, carried: 0 }
    const payerBorne = isPayerBorneWhtCondition(item.whtCondition ?? 'withhold')
    const base = payerBorne ? item.grossSatang - item.whtSatang : item.grossSatang
    current.base += base
    if (item.whtSatang === 0) current.unwithheld += base
    current.carried += item.whtCarriedBaseSatang
    totals.set(item.payeeId, current)
  }
  return new Map(
    [...totals].map(([payeeId, total]) => [
      payeeId,
      { priorBaseSatang: total.base, priorUnwithheldBaseSatang: Math.max(0, total.unwithheld - total.carried) },
    ]),
  )
}

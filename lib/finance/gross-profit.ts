import { assertSatang, sumSatang } from '@/lib/finance/satang'

/**
 * กำไรขั้นต้น (`22` §6.12 · `21` §6.1) — **pure ล้วน ไม่มี I/O**
 *
 * - **Revenue ที่ใช้คือยอดก่อน VAT** (`revenues.gross_satang`) — VAT ไม่ใช่รายได้ของบริษัท
 * - **Direct Cost** = fuel + allowance + commission/no-success fee ของมิติเดียวกันช่วงเวลาเดียวกัน
 *   (ประกอบยอดต่อเคสด้วย `directCostSatang()` ของ `lib/finance/compensation-calc.ts`)
 * - **ห้ามหารศูนย์** (Rule 01): `revenue = 0` ⇒ `marginPct = null` ให้ display แสดง `N/A`
 *   (`fmtRatioPct(null)` ของ `lib/format/money.ts` รองรับไว้แล้ว)
 * - เป็น **Actual** ไม่ใช่ประมาณการ — เคส `closed_fail` ที่ไม่มีรายได้แต่มีต้นทุน กด margin ลงจริง
 */

export interface GrossProfitInput {
  /** ยอดรายได้ก่อน VAT ของมิตินั้น (สตางค์) */
  revenueSatang: number
  /** ต้นทุนตรงของมิตินั้น (สตางค์) */
  directCostSatang: number
}

export interface GrossProfit extends GrossProfitInput {
  /** `revenue - direct_cost` — ติดลบได้ (ขาดทุนขั้นต้น) */
  grossProfitSatang: number
  /** `(gross_profit / revenue) × 100` — `null` เมื่อ `revenue <= 0` (ห้ามหารศูนย์) */
  marginPct: number | null
}

/** `22` §6.12 — กำไรขั้นต้นและ margin ของ 1 มิติ */
export function grossProfit(input: GrossProfitInput): GrossProfit {
  assertSatang(input.revenueSatang, 'รายได้')
  assertSatang(input.directCostSatang, 'ต้นทุนตรง')

  const grossProfitSatang = input.revenueSatang - input.directCostSatang
  return {
    ...input,
    grossProfitSatang,
    marginPct: input.revenueSatang > 0 ? (grossProfitSatang / input.revenueSatang) * 100 : null,
  }
}

export interface GrossProfitRow extends GrossProfitInput {
  /** คีย์ของมิติ (บริษัทไฟแนนซ์ / ทีม — `21` §6.2) */
  key: string
  label?: string
}

export interface GrossProfitBreakdown {
  rows: Array<GrossProfitRow & GrossProfit>
  /** ยอดรวมทุกมิติ (KPI cards ด้านบนของหน้า `21` §8) */
  total: GrossProfit
}

/**
 * กำไรขั้นต้นแยกตามมิติ + ยอดรวม — margin ของยอดรวมคิดจาก **ยอดรวม** ไม่ใช่ค่าเฉลี่ยของ margin รายแถว
 * (เฉลี่ย % ของแถวคือตัวเลขที่ผิดเสมอเมื่อขนาดแต่ละมิติไม่เท่ากัน)
 */
export function summarizeGrossProfit(rows: readonly GrossProfitRow[]): GrossProfitBreakdown {
  const revenueSatang = sumSatang(rows.map((row) => row.revenueSatang), 'รายได้รวม')
  const directCostSatang = sumSatang(rows.map((row) => row.directCostSatang), 'ต้นทุนตรงรวม')

  return {
    rows: rows.map((row) => ({ ...row, ...grossProfit(row) })),
    total: grossProfit({ revenueSatang, directCostSatang }),
  }
}

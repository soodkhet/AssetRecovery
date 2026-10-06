import { assertNonNegativeSatang, assertSatang, sumSatang } from '@/lib/finance/satang'
import { describeAgingBuckets } from '@/lib/settings/finance-policy'
import { toBangkokDayNumber, toDayNumber } from '@/lib/settings/vat'

/**
 * ลูกหนี้คงค้าง + AR Aging (`22` §6.11 · `19` §6.4) — **pure ล้วน ไม่มี I/O**
 *
 * ช่วงอายุหนี้ (`ar_aging_buckets`) เป็น **ค่าตั้งได้ระดับองค์กร** (`13` §6.2.1 — ค่าเริ่มต้น
 * `[30, 60, 90]` ⇒ 0-30 / 31-60 / 61-90 / 90+ วัน) ห้าม hardcode ช่วงในรายงาน
 *
 * นับอายุจาก **วันครบกำหนดชำระ** (`billing_batches.due_date` = คอลัมน์ `DATE`) เทียบกับวันที่ดูรายงาน
 * ตามปฏิทิน**ไทย** — ยังไม่ถึงกำหนด (`daysOverdue <= 0`) นับรวมอยู่ช่วงแรกเสมอ
 */

export interface BillingBatchAmounts {
  totalSatang: number
  receivedSatang: number
  /**
   * WHT ที่ **ลูกค้าหักจากเรา** (A1) — ต้องระบุเสมอ (ไม่ optional โดยเจตนา) เพราะเคยมีจุดที่ลืมบวก
   * แล้วยอดค้างไม่ตรงกับสถานะ `paid` ของบิลเดียวกัน · ไม่มีการหัก ⇒ ส่ง `0`
   */
  whtWithheldByCustomerSatang: number
  /**
   * มติ PO U144 — ส่วนต่างที่ตัดเป็น **ค่าธรรมเนียมธนาคาร** ตอนรับชำระขาดไม่เกินเพดาน
   * (`resolveBankFeeWriteOff()`) · ต้องระบุเสมอเหตุผลเดียวกับ WHT — ไม่งั้นบิลที่ปิดแล้วยังค้างในรายงาน · ไม่มี ⇒ `0`
   */
  bankFeeWrittenOffSatang: number
}

/**
 * ยอดที่ถือว่า "ชำระแล้ว" ของรอบวางบิล = เงินที่รับเข้าจริง + WHT ที่ลูกค้าหักไว้ (A1)
 *
 * ⚠️ เงินส่วน WHT ไม่ได้เข้าบัญชีเราแต่ไปเป็นเครดิตภาษี ⇒ **ไม่ใช่หนี้ค้าง** ถ้าไม่บวกกลับ ทุกบิล
 * จะค้างค้างอยู่เท่าอัตรา WHT ตลอดกาล · นิยามนี้ต้องมีที่เดียวเท่านั้น — ทั้งตัวตัดสินสถานะ
 * (`resolveBillingStatusAfterReceipt`) AR Aging และ KPI แดชบอร์ดต้องใช้ตัวนี้ร่วมกัน
 */
export function settledSatang(batch: BillingBatchAmounts): number {
  assertSatang(batch.receivedSatang, 'ยอดรับชำระแล้ว')
  assertSatang(batch.whtWithheldByCustomerSatang, 'WHT ที่ลูกค้าหัก')
  assertSatang(batch.bankFeeWrittenOffSatang, 'ค่าธรรมเนียมธนาคารที่ตัดส่วนต่าง')
  return batch.receivedSatang + batch.whtWithheldByCustomerSatang + batch.bankFeeWrittenOffSatang
}

/**
 * มติ PO 07/10/2569 U144 (`22` §6.11.1) — **ตัดส่วนต่างที่ขาดเป็นค่าธรรมเนียมธนาคาร**
 *
 * ลูกค้าโอนขาดไม่กี่สิบบาทเพราะธนาคารหักค่าธรรมเนียมปลายทาง — ถ้าส่วนที่ขาด (หลังนับ WHT ที่ลูกค้าหัก) ไม่เกิน
 * เพดาน `finance_policy_settings.write_off_tolerance_satang` ⇒ ตัดส่วนต่างนั้นเป็นค่าธรรมเนียมธนาคาร (รอบปิดเป็น `paid`)
 * · เกินเพดาน / ยังไม่รับเงินเลย / รับครบหรือเกิน / เพดาน = 0 ⇒ `0` (ไม่ตัด — ค้างตามเดิม)
 *
 * รับ **ยอดสะสม** (ไม่ใช่ส่วนเพิ่ม) ⇒ คำนวณซ้ำได้ทุกครั้งที่ยอดรับเปลี่ยน (idempotent) — ผลไม่สะสมทับกัน
 */
export function resolveBankFeeWriteOff(input: {
  totalSatang: number
  receivedSatang: number
  whtWithheldByCustomerSatang: number
  toleranceSatang: number
}): number {
  assertSatang(input.totalSatang, 'ยอดบิลรวม')
  assertSatang(input.receivedSatang, 'ยอดรับชำระแล้ว')
  assertSatang(input.whtWithheldByCustomerSatang, 'WHT ที่ลูกค้าหัก')
  assertNonNegativeSatang(input.toleranceSatang, 'เพดานตัดส่วนต่างค่าธรรมเนียม')
  if (input.receivedSatang <= 0) return 0
  const shortfall = input.totalSatang - input.receivedSatang - input.whtWithheldByCustomerSatang
  if (shortfall <= 0) return 0
  return shortfall <= input.toleranceSatang ? shortfall : 0
}

/**
 * มติ PO 07/10/2569 U163 (`22` §6.11.1 · ต่อยอด A1/U144) — **ภาษีที่ลูกค้าหัก ณ ที่จ่าย ของใบเงินรับใบนี้**
 * เมื่อเงินเข้ามีทั้งภาษีที่ลูกค้าหัก + ค่าธรรมเนียมโอนปนกัน ⇒ **นับภาษีก่อน ส่วนต่างที่เหลือเป็นค่าธรรมเนียม**
 *
 * ให้ `net = total − expectedWht` (ยอดคาดรับหลังลูกค้าหัก) และ `cumulative = priorReceived + receipt` (ยอดรับสะสม):
 * - `net − tolerance <= cumulative <= net` ⇒ ภาษีลูกค้าหัก **เต็มจำนวนที่คาด** (หักส่วนที่ใบก่อนบันทึกไปแล้ว)
 *   — ส่วนต่าง `net − cumulative` (≤ เพดาน) ไปเป็นค่าธรรมเนียมธนาคารใน `resolveBankFeeWriteOff()`
 * - รับเต็มยอดบิล (ลูกค้าไม่หัก) / ขาดเกินช่วง / ลูกค้าไม่ได้ตั้งให้หัก (`expectedWht = 0`) ⇒ `0` (พฤติกรรมเดิม)
 * · `tolerance = 0` ⇒ เหลือกรณีเงินเข้า = `net` พอดี = กติกา A1 เดิม
 * · เลขจำนวนเต็มล้วน ไม่คิดอัตราใหม่ — `expectedWht` มาจากยอดที่ snapshot/ประมาณไว้กับรอบวางบิลแล้ว
 */
export function resolveCustomerWhtForReceipt(input: {
  totalSatang: number
  /** ภาษีที่คาดว่าลูกค้าจะหัก (ยอดบิล − ยอดคาดรับ) · ไม่ได้ตั้งให้หัก = `0` */
  expectedWhtSatang: number
  /** ยอดรับสะสมของใบเงินรับใบก่อน ๆ ของรอบเดียวกัน (ไม่รวมใบนี้) */
  priorReceivedSatang: number
  /** ภาษีลูกค้าหักที่ใบก่อน ๆ บันทึกไปแล้ว */
  priorWhtSatang: number
  /** ยอดเงินเข้าของใบนี้ (บวก) */
  receiptSatang: number
  toleranceSatang: number
}): number {
  assertSatang(input.totalSatang, 'ยอดบิลรวม')
  assertNonNegativeSatang(input.expectedWhtSatang, 'ภาษีที่คาดว่าลูกค้าจะหัก')
  assertNonNegativeSatang(input.priorReceivedSatang, 'ยอดรับสะสมก่อนหน้า')
  assertNonNegativeSatang(input.priorWhtSatang, 'ภาษีลูกค้าหักที่บันทึกแล้ว')
  assertNonNegativeSatang(input.receiptSatang, 'ยอดเงินเข้า')
  assertNonNegativeSatang(input.toleranceSatang, 'เพดานตัดส่วนต่างค่าธรรมเนียม')
  if (input.expectedWhtSatang <= 0 || input.receiptSatang <= 0) return 0
  const net = input.totalSatang - input.expectedWhtSatang
  const cumulative = input.priorReceivedSatang + input.receiptSatang
  if (cumulative > net || cumulative < net - input.toleranceSatang) return 0
  return Math.max(0, input.expectedWhtSatang - input.priorWhtSatang)
}

/**
 * `22` §6.11 — `ar_outstanding = total_amount - received_amount` (`received` = `settledSatang()`)
 * ค่าติดลบ = รับเงินเกินยอดบิล (เกิดได้จริงตอนลูกค้าโอนเกิน) — คืนตามจริง ไม่ clamp เพื่อไม่ให้ยอดหาย
 */
export function arOutstandingSatang(batch: BillingBatchAmounts): number {
  assertSatang(batch.totalSatang, 'ยอดบิลรวม')
  return batch.totalSatang - settledSatang(batch)
}

/**
 * จำนวนวันที่เลยกำหนดชำระ ณ วันที่ดูรายงาน — บวก = เลยกำหนดแล้ว · ลบ = ยังไม่ถึงกำหนด
 *
 * `dueDate` มาจากคอลัมน์ `DATE` (เที่ยงคืน UTC) ส่วน `asOf` เป็น instant ⇒ ใช้ตัวแปลงคนละตัวตาม
 * บทเรียนของ VAT resolver (`lib/settings/vat.ts`) ไม่งั้นรายงานตอนเย็นเวลาไทยจะเพี้ยนไป 1 วัน
 */
export function daysOverdue(dueDate: Date, asOf: Date): number {
  return toBangkokDayNumber(asOf) - toDayNumber(dueDate)
}

/**
 * ช่วงอายุหนี้ที่ยอดนี้ตกอยู่ — คืน index ของช่วง (`0` = ช่วงแรก ... `buckets.length` = ช่วง "90+")
 * ยังไม่ถึงกำหนดชำระ (`daysOverdue <= 0`) นับอยู่ช่วงแรกตามมาตรฐาน AR Aging
 */
export function agingBucketIndex(days: number, buckets: readonly number[]): number {
  for (const [index, limit] of buckets.entries()) {
    if (days <= limit) return index
  }
  return buckets.length
}

export interface ArAgingRow extends BillingBatchAmounts {
  dueDate: Date
}

export interface ArAgingBucket {
  /** หัวคอลัมน์จาก `describeAgingBuckets()` — เช่น `0-30 วัน` / `90+ วัน` */
  label: string
  outstandingSatang: number
  batchCount: number
}

/**
 * สรุป AR Aging ตามช่วงที่องค์กรตั้งไว้ (`19` §6.4)
 * — นับเฉพาะบิลที่ยัง **มียอดค้าง** (`outstanding > 0`); บิลที่จ่ายครบ/จ่ายเกินไม่เข้ารายงานค้างรับ
 */
export function summarizeArAging(
  rows: readonly ArAgingRow[],
  buckets: readonly number[],
  asOf: Date,
): ArAgingBucket[] {
  // `describeAgingBuckets()` เรียง+ตัดค่าซ้ำในตัว ⇒ ต้องใช้ชุดเดียวกันตอนหา index ไม่งั้นป้ายกับยอดสลับช่อง
  const sorted = [...new Set(buckets)].sort((a, b) => a - b)
  if (sorted.length === 0) throw new RangeError('summarizeArAging: ต้องมีช่วงอายุหนี้อย่างน้อย 1 ช่วง')

  const labels = describeAgingBuckets(sorted)
  const summary: ArAgingBucket[] = labels.map((label) => ({ label, outstandingSatang: 0, batchCount: 0 }))

  for (const row of rows) {
    const outstanding = arOutstandingSatang(row)
    if (outstanding <= 0) continue
    const bucket = summary[agingBucketIndex(daysOverdue(row.dueDate, asOf), sorted)]
    if (bucket === undefined) continue
    bucket.outstandingSatang += outstanding
    bucket.batchCount += 1
  }

  return summary
}

/** ยอดค้างรับรวมทุกช่วง — ตัวเลข KPI ด้านบนของหน้า AR */
export function totalArOutstandingSatang(rows: readonly ArAgingRow[]): number {
  return sumSatang(
    rows.map((row) => Math.max(0, arOutstandingSatang(row))),
    'ยอดค้างรับรวม',
  )
}

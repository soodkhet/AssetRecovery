import { pctOfSatang } from '@/lib/finance/satang'

/**
 * **ลดยอดส่วนที่ยังไม่ได้ออกใบกำกับภาษี — ไม่ต้องออกใบลดหนี้** (มติผู้ใช้ 12/10/2569 · รีวิว mytester3 R3 #1 ·
 * `22` §6.8.3) — **pure ล้วน ไม่มี I/O**
 *
 * ใบเสร็จรับเงิน/ใบกำกับภาษีออกเมื่อรับชำระ (ม.78/1(2)) ⇒ มูลค่าที่ยังไม่ได้ออกใบยังไม่เกิดจุดความรับผิด VAT ·
 * Adjustment ลดยอดที่อนุมัติแล้วของรอบวางบิลจึงลด "ส่วนที่ยังไม่ออกใบ" ก่อน (ไม่ต้องมีใบลดหนี้ — ม.86/10 ใช้แก้ใบที่
 * ออกไปแล้วเท่านั้น) · ส่วนที่ลดเกินมูลค่าที่ยังไม่ออกใบ (ลดลงไปในส่วนที่ออกใบแล้ว) ยังต้องมีใบลดหนี้ เฉพาะส่วนเกินนั้น
 *
 * ### สูตร (ก่อน VAT ทุกตัว · ต่อรอบวางบิล)
 * ```
 * V        = max(0, ใบแจ้งหนี้ − Σ ใบกำกับ active)                     (มูลค่าที่ยังไม่ออกใบ ก่อนหักส่วนลด)
 * D        = Σ Adjustment ลดยอด `approved` ของรอบ (ระดับรอบ + ระดับรายได้ในรอบ)
 * C        = Σ ใบลดหนี้ active ของรอบ
 * required = max(0, D − V)                                                (ส่วนที่ลดลงไปในส่วนที่ออกใบแล้ว ⇒ ต้องมีใบลดหนี้)
 * R        = max(0, D − max(required, C))                                 (ส่วนที่ลดในมูลค่าที่ยังไม่ออกใบ — ไม่ต้องมีใบลดหนี้)
 * ใบลดหนี้ที่ยังบันทึกได้ = max(0, required − C)   (เฉพาะรอบที่ V > 0 — ออกใบครบรอบแล้วใช้กติกาเดิม)
 * ```
 * - คิดจาก**ยอดที่บันทึก**ไม่ใช่ลำดับเวลา ⇒ อนุมัติก่อน/หลังออกใบได้ผลเดียวกัน · `R ≤ V` เสมอ (ยอดไม่ติดลบ)
 * - ใบลดหนี้ที่บันทึกไว้แล้ว (รวมข้อมูลเดิมที่ลดส่วนที่ยังไม่ออกใบ — มติ G3-01) นับก่อน ⇒ ไม่หักซ้ำ
 * - รอบที่มีใบกำกับแบบเดิม (ออกตอนวางบิล) active ⇒ ไม่ใช้กติกานี้ (R = 0 · ไม่จำกัดใบลดหนี้เพิ่ม — พฤติกรรมเดิม)
 * - VAT ของ R: อัตราเดียวทั้งรอบ ⇒ `pctOfSatang(R, อัตรา)` · หลายอัตรา ⇒ ตามสัดส่วน VAT/ก่อน VAT ของใบแจ้งหนี้ (ปัดครึ่งขึ้น)
 *   · R = V (ลดหมดส่วนที่ยังไม่ออกใบ) + อัตราเดียวกับใบกำกับ ⇒ VAT ใบแจ้งหนี้ − VAT ที่ออกแล้ว (mytester4 G4-01 — กันเศษ 0.01 ค้าง AR)
 * - R หักจาก "ยอดตามเอกสาร" ของรอบ (ลูกหนี้/พอร์ทัล — `documentedAmountsForBatches()`) และจากฐานใบเสร็จฯ ถัดไป
 *   (`receiptInvoiceAmounts()`) ⇒ รับชำระครบ: Σ ใบกำกับ − Σ ใบลดหนี้ + Σ ใบเพิ่มหนี้ = ยอดสุทธิของรอบ ทุกสตางค์
 */

/** เหตุผลที่บันทึกตอนปิด Adjustment อัตโนมัติ (คอลัมน์เหตุผลปิดป้าย + audit) — ข้อความเดียวใช้แสดงผลด้วย */
export const UNINVOICED_REDUCTION_WAIVE_REASON = 'ส่วนที่ลดยังไม่ได้ออกใบกำกับภาษี — ไม่ต้องออกใบลดหนี้'

export interface UninvoicedReductionInput {
  /** ยอดก่อน VAT ตามใบแจ้งหนี้ (`sales_records`) */
  billedBeforeVatSatang: number
  /** VAT ตามใบแจ้งหนี้ */
  billedVatSatang: number
  /** อัตรา VAT ใน snapshot รายได้ของรอบ */
  billedVatRatesPct: readonly number[]
  /** Σ ก่อน VAT ของใบกำกับ active ของรอบ */
  invoicedBeforeVatSatang: number
  /** Σ ก่อน VAT ของใบลดหนี้ active ของรอบ */
  creditNoteBeforeVatSatang: number
  /** Σ ยอด Adjustment ลดยอด `approved` ของรอบ (ยอดก่อน VAT) */
  decreaseSatang: number
  /** รอบมีใบกำกับแบบเดิม (ออกตอนวางบิล) active */
  legacyInvoice: boolean
  /**
   * mytester4 G4-01 — Σ VAT ของใบกำกับ active + อัตราบนใบ (ไม่ส่ง = ไม่ใช้กติกาปิดเศษ) ⇒ ลดหมดส่วนที่ยังไม่ออกใบ (R = V)
   * และอัตราเดียวกันทั้งรอบ: VAT ของ R = VAT ใบแจ้งหนี้ − VAT ที่ออกแล้ว (สูตรเดียวกับใบปิดยอด `22` §6.8.2) ไม่ใช่ R × อัตรา
   */
  invoicedVatSatang?: number
  invoicedVatRatesPct?: readonly number[]
}

export interface UninvoicedReduction {
  /** R — ส่วนที่ลดในมูลค่าที่ยังไม่ออกใบ (ไม่ต้องมีใบลดหนี้) */
  beforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** V − R — มูลค่าที่ยังออกใบเสร็จฯ ได้อีก (ก่อน VAT) */
  remainingBeforeVatSatang: number
  /**
   * ใบลดหนี้ที่ยังบันทึกได้ (ก่อน VAT) = max(0, required − C) · `null` = กติกานี้ไม่จำกัด
   * (ใบกำกับแบบเดิม / ออกใบครบรอบแล้ว V = 0 ⇒ ลดหนี้ตามกติกาเดิม)
   */
  creditNoteAllowanceBeforeVatSatang: number | null
}

export const NO_UNINVOICED_REDUCTION: UninvoicedReduction = Object.freeze({
  beforeVatSatang: 0,
  vatSatang: 0,
  totalSatang: 0,
  remainingBeforeVatSatang: 0,
  creditNoteAllowanceBeforeVatSatang: null,
})

function assertSatangInput(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} ต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ (ได้ ${value})`)
  }
}

function sameRate(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

/** VAT ของส่วนที่ลด — อัตราเดียว ⇒ ตัวคูณกลาง · หลายอัตรา ⇒ สัดส่วนของใบแจ้งหนี้ (BigInt กันล้น · ปัดครึ่งขึ้น) */
export function reductionVatSatang(
  reductionBeforeVatSatang: number,
  basis: Pick<UninvoicedReductionInput, 'billedBeforeVatSatang' | 'billedVatSatang' | 'billedVatRatesPct'>,
): number {
  if (reductionBeforeVatSatang <= 0) return 0
  const [first] = basis.billedVatRatesPct
  if (first !== undefined && basis.billedVatRatesPct.every((rate) => sameRate(rate, first))) {
    return pctOfSatang(reductionBeforeVatSatang, first)
  }
  if (basis.billedBeforeVatSatang <= 0 || basis.billedVatSatang <= 0) return 0
  const numerator = BigInt(reductionBeforeVatSatang) * BigInt(basis.billedVatSatang) * 2n + BigInt(basis.billedBeforeVatSatang)
  return Number(numerator / (2n * BigInt(basis.billedBeforeVatSatang)))
}

/**
 * mytester4 G4-01 — ลดหมดส่วนที่ยังไม่ออกใบ ⇒ VAT ที่เหลือของใบแจ้งหนี้ต้องหมดพอดี (ไม่มีเศษสตางค์ลอยใน AR) ·
 * ใช้เมื่อรู้ VAT ของใบที่ออกแล้ว และอัตราบนใบแจ้งหนี้/ใบกำกับทุกใบเท่ากัน (อัตราเปลี่ยน ⇒ สูตรอัตราตามเดิม)
 */
function closesUninvoicedVat(input: UninvoicedReductionInput): boolean {
  if (input.invoicedVatSatang === undefined) return false
  assertSatangInput(input.invoicedVatSatang, 'VAT ของใบกำกับ')
  const [first] = input.billedVatRatesPct
  if (first === undefined) return false
  const rates = [...input.billedVatRatesPct, ...(input.invoicedVatRatesPct ?? [])]
  return rates.every((rate) => sameRate(rate, first))
}

export function uninvoicedReductionOf(input: UninvoicedReductionInput): UninvoicedReduction {
  assertSatangInput(input.billedBeforeVatSatang, 'ยอดก่อน VAT ตามใบแจ้งหนี้')
  assertSatangInput(input.billedVatSatang, 'VAT ตามใบแจ้งหนี้')
  assertSatangInput(input.invoicedBeforeVatSatang, 'ยอดก่อน VAT ของใบกำกับ')
  assertSatangInput(input.creditNoteBeforeVatSatang, 'ยอดก่อน VAT ของใบลดหนี้')
  assertSatangInput(input.decreaseSatang, 'ยอด Adjustment ลดยอด')
  if (input.legacyInvoice) return NO_UNINVOICED_REDUCTION

  const uninvoiced = Math.max(0, input.billedBeforeVatSatang - input.invoicedBeforeVatSatang)
  const required = Math.max(0, input.decreaseSatang - uninvoiced)
  const reduction = Math.max(0, input.decreaseSatang - Math.max(required, input.creditNoteBeforeVatSatang))
  const vatSatang =
    reduction > 0 && reduction === uninvoiced && closesUninvoicedVat(input)
      ? Math.max(0, input.billedVatSatang - (input.invoicedVatSatang ?? 0))
      : reductionVatSatang(reduction, input)
  return {
    beforeVatSatang: reduction,
    vatSatang,
    totalSatang: reduction + vatSatang,
    remainingBeforeVatSatang: uninvoiced - reduction,
    creditNoteAllowanceBeforeVatSatang:
      uninvoiced > 0 ? Math.max(0, required - input.creditNoteBeforeVatSatang) : null,
  }
}

/**
 * ตอนอนุมัติ Adjustment ลดยอด: ยอดนี้ลดอยู่ในมูลค่าที่ยังไม่ออกใบ**ทั้งหมด**ไหม — `before` = ผลของรอบ**ก่อน**นับรายการนี้
 * ⇒ `true` = ปิดแบบ "ไม่ต้องออกใบลดหนี้" อัตโนมัติ · `false` = มีส่วนที่ลดลงไปในส่วนที่ออกใบแล้ว ⇒ รอใบลดหนี้ (เฉพาะส่วนเกิน)
 * · รอบใบกำกับแบบเดิม (`remainingBeforeVatSatang` = 0) ⇒ `false` เสมอ (กติกาเดิม)
 */
export function decreaseFitsUninvoiced(amountSatang: number, before: Pick<UninvoicedReduction, 'remainingBeforeVatSatang'>): boolean {
  assertSatangInput(amountSatang, 'ยอด Adjustment')
  return amountSatang > 0 && amountSatang <= before.remainingBeforeVatSatang
}

/**
 * ป้าย "รอใบลดหนี้" ของ Adjustment ลดยอดยังควรขึ้นไหม (ตามใบลดหนี้ที่ยังบันทึกได้ของรอบ) ·
 * `null`/ไม่ทราบ = กติกาเดิม (ขึ้น) · `0` = ส่วนที่ลดยังไม่ได้ออกใบกำกับ ⇒ ไม่ต้องออกใบลดหนี้
 */
export function creditNoteStillRequired(allowanceBeforeVatSatang: number | null | undefined): boolean {
  return allowanceBeforeVatSatang === null || allowanceBeforeVatSatang === undefined || allowanceBeforeVatSatang > 0
}

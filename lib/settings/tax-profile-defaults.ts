import type { PayeeType, PayoutBatchSide } from '@/lib/generated/prisma/enums'

/**
 * **Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ** (มติ PO 06/10/2569 U121 · `13` §6.4.3 · `18` §6.3) — pure ใช้ร่วม FE/BE
 *
 * 4 ช่อง = ฝั่ง (inhouse/outsource — `resolvePayoutSide()`) × ชนิดผู้รับ (บุคคลธรรมดา/นิติบุคคล — `payee_type`)
 * · แต่ละช่องผูก `tax_profiles` ได้ 0–1 ตัว (ว่าง = ไม่มีค่าเริ่มต้นสำหรับประเภทนั้น)
 *
 * ลำดับ resolve อัตรา (`resolveWhtRate()`): ตั้งรายคน (`payee_profiles.tax_profile_id`) → **ค่าเริ่มต้นตามประเภท**
 * → อัตราของแผน (เตือน) → ไม่มีเลย = บล็อกการสร้างรอบจ่าย · ค่าเริ่มต้นนับเป็นฝั่ง payee ("Payee ชนะ Plan" คงเดิม)
 *
 * เก็บแบบ **insert-only** (`tax_profile_default_history`) — แถวที่บันทึกล่าสุดมีผลทันทีกับรอบจ่ายที่สร้างหลังบันทึก
 * · รอบจ่ายเดิม snapshot Tax Profile ที่ใช้จริงไว้ที่ `payout_batch_items.tax_profile_id` แล้ว จึงไม่คิดย้อนหลัง
 */

export const TAX_PROFILE_DEFAULT_SLOTS = [
  'inhouseIndividual',
  'inhouseCorporate',
  'outsourceIndividual',
  'outsourceCorporate',
] as const

export type TaxProfileDefaultSlot = (typeof TAX_PROFILE_DEFAULT_SLOTS)[number]

/** ค่าของ 4 ช่อง — `T` = id (`string`) หรือค่าของ Tax Profile ที่โหลดแล้ว */
export type TaxProfileDefaults<T> = Record<TaxProfileDefaultSlot, T | null>

export const TAX_PROFILE_DEFAULT_SLOT_LABEL: Record<TaxProfileDefaultSlot, string> = {
  inhouseIndividual: 'Inhouse · บุคคลธรรมดา',
  inhouseCorporate: 'Inhouse · นิติบุคคล',
  outsourceIndividual: 'Outsource · บุคคลธรรมดา',
  outsourceCorporate: 'Outsource · นิติบุคคล',
}

/** ยังไม่เคยตั้ง = ว่างทั้ง 4 ช่อง */
export function emptyTaxProfileDefaults<T>(): TaxProfileDefaults<T> {
  return { inhouseIndividual: null, inhouseCorporate: null, outsourceIndividual: null, outsourceCorporate: null }
}

/** ช่องของผู้รับ — ไม่มีฝั่ง (เช่น role ฝั่งสำนักงาน) ⇒ `null` (ไม่มีค่าเริ่มต้นให้ใช้) */
export function taxProfileDefaultSlotOf(side: PayoutBatchSide | null, payeeType: PayeeType): TaxProfileDefaultSlot | null {
  if (side === null) return null
  const corporate = payeeType === 'corporate'
  if (side === 'inhouse') return corporate ? 'inhouseCorporate' : 'inhouseIndividual'
  return corporate ? 'outsourceCorporate' : 'outsourceIndividual'
}

/** ค่าเริ่มต้นของผู้รับ (ฝั่ง × ชนิด) — ไม่มีช่อง/ช่องว่าง ⇒ `null` */
export function pickTaxProfileDefault<T>(
  defaults: TaxProfileDefaults<T>,
  side: PayoutBatchSide | null,
  payeeType: PayeeType,
): T | null {
  const slot = taxProfileDefaultSlotOf(side, payeeType)
  return slot === null ? null : defaults[slot]
}

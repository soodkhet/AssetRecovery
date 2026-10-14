import { HOTEL_NIGHTS_RANGE_MESSAGE, parseHotelNightsInput } from '@/lib/field/hotel-claim'
import { bahtInputError, fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'
import { SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN } from '@/lib/substitute-receipts/substitute-receipt'

/**
 * หลักฐานรายจ่ายในฟอร์ม "แก้ไขรายการเบิกที่ถูกตีกลับ" — pure (มติ PO 14/10/2569 SV5-R2-01 แนวทาง ก)
 *
 * ใบเบิกที่เคยใช้ใบรับรองแทนใบเสร็จเลือกหลักฐานได้ในฟอร์มส่งใหม่ฟอร์มเดียว:
 * - `keep_substitute` ใช้ใบรับรองที่ใช้งานอยู่ (มีใบที่ใช้งานอยู่เท่านั้น)
 * - `new_substitute` ออกใบรับรองใหม่ตามยอดที่กรอก (ค่าเริ่มต้นเมื่อใบเดิมถูกยกเลิกแล้ว)
 * - `receipt` แนบใบเสร็จจริง
 * ใบเบิกที่ไม่เคยใช้ใบรับรอง ⇒ `receipt` เสมอ (แนบใหม่หรือใช้ใบเสร็จเดิม) · server ตรวจซ้ำทุกกรณี
 */
export type ResubmitEvidenceMode = 'keep_substitute' | 'new_substitute' | 'receipt'

export interface ResubmitEvidenceState {
  /** มีใบรับรองที่ใช้งานอยู่ */
  hasActiveSubstitute: boolean
  /** เคยใช้ใบรับรองแทนใบเสร็จ (รวมใบที่ยกเลิก) */
  hasSubstituteHistory: boolean
  /** มีไฟล์ใบเสร็จจริงอยู่แล้ว (ไม่ใช่ฉบับเซ็นของใบรับรอง) */
  hasRealReceipt: boolean
}

/** ไฟล์ใบเสร็จของใบเบิกเป็นใบเสร็จจริงไหม — มีใบรับรองที่ใช้งานอยู่ ⇒ ไฟล์ (ถ้ามี) คือฉบับเซ็นของใบรับรอง */
export function hasRealReceiptFile(input: { receiptFileUrl: string | null; hasActiveSubstitute: boolean }): boolean {
  return input.receiptFileUrl !== null && !input.hasActiveSubstitute
}

export function defaultResubmitEvidenceMode(input: ResubmitEvidenceState): ResubmitEvidenceMode {
  if (input.hasActiveSubstitute) return 'keep_substitute'
  if (input.hasRealReceipt) return 'receipt'
  if (input.hasSubstituteHistory) return 'new_substitute'
  return 'receipt'
}

/** ทางเลือกที่แสดง — ไม่เคยใช้ใบรับรอง/มีใบเสร็จจริงแล้ว = ไม่มีตัวเลือก (ช่องแนบใบเสร็จอย่างเดียว) */
export function resubmitEvidenceModes(input: ResubmitEvidenceState): ResubmitEvidenceMode[] {
  // มีใบเสร็จจริงอยู่แล้ว ⇒ ช่องใบเสร็จอย่างเดียว (ใช้เดิม/เปลี่ยนไฟล์) — ออกใบรับรองซ้อนไม่ได้ (server ปฏิเสธ)
  if (!input.hasSubstituteHistory || input.hasRealReceipt) return []
  return input.hasActiveSubstitute ? ['keep_substitute', 'new_substitute', 'receipt'] : ['new_substitute', 'receipt']
}

/**
 * ข้อความบนปุ่มเลือกไฟล์ใบเสร็จ — "ใช้ใบเสร็จเดิม" เฉพาะเมื่อมีใบเสร็จจริงอยู่แล้ว (ตรวจซ้ำ staging SV5-R2-01:
 * ใบเบิกที่ใช้ใบรับรองแทนใบเสร็จไม่เคยมีใบเสร็จ ห้ามอ้างใบเสร็จเดิม)
 */
export function resubmitReceiptPickerText(input: { hasExistingReceipt: boolean; fileName: string | null }): string {
  if (input.fileName !== null) return input.fileName
  return input.hasExistingReceipt ? 'ใช้ใบเสร็จเดิม — แตะเพื่อเปลี่ยน' : 'แตะเพื่อเลือกไฟล์ใบเสร็จ'
}

/**
 * ต้องแนบไฟล์ใบเสร็จใหม่ไหม (โหมด `receipt`) — ไม่มีใบเสร็จจริงอยู่แล้ว และ (เคยใช้ใบรับรอง หรือเป็นค่าที่พัก) ⇒ บังคับ
 * (เลือกแนบใบเสร็จจริงแทนใบรับรองแต่ไม่แนบไฟล์ = ไม่มีหลักฐาน)
 */
export function resubmitReceiptFileRequired(input: ResubmitEvidenceState & { mode: ResubmitEvidenceMode; isHotel: boolean }): boolean {
  if (input.mode !== 'receipt' || input.hasRealReceipt) return false
  return input.hasSubstituteHistory || input.isHotel
}

/** ช่องในฟอร์มส่งใหม่ที่ข้อความผิดพลาดชี้ไป — ใช้เลื่อน/โฟกัสไปช่องนั้น (ตรวจซ้ำ staging SV5-R3-01) */
export type ResubmitFormField = 'amount' | 'nights' | 'lines' | 'cancelReason' | 'receipt' | 'note'

export interface ResubmitFormIssue {
  field: ResubmitFormField
  message: string
}

/**
 * ตรวจฟอร์มส่งใหม่ฝั่ง client ก่อนส่ง — คืนข้อผิดพลาดข้อแรก (ไล่ตามลำดับช่องบนฟอร์มจากบนลงล่าง) หรือ `null` = ผ่าน
 * ⚠️ UX guard เท่านั้น — server ตรวจซ้ำทุกข้อ
 */
export function resubmitFormIssue(input: {
  /** ช่องยอดเงินแก้ได้ (รายการแยก และยอดไม่ถูกล็อกตามใบรับรอง) */
  amountEditable: boolean
  amountBaht: string
  /** ค่าที่พัก ⇒ ตรวจช่องจำนวนคืน */
  isHotel: boolean
  nightsText: string
  /** ออกใบรับรองใหม่ — `linesError` = ผลตรวจรายการของใบ (`null` = ผ่าน) · `linesTotalSatang` = ยอดรวมรายการ */
  newSubstitute: boolean
  linesError: string | null
  linesTotalSatang: number
  /** ยกเลิกใบรับรองที่ใช้งานอยู่พร้อมการส่ง ⇒ เหตุผลบังคับ */
  cancelsActive: boolean
  cancelReason: string
  /** ต้องแนบไฟล์ใบเสร็จใหม่แต่ยังไม่ได้เลือกไฟล์ */
  receiptMissing: boolean
  note: string
}): ResubmitFormIssue | null {
  let amountSatang: number | null = null
  if (input.amountEditable) {
    const parsed = parseBahtInput(input.amountBaht)
    if (parsed === null || Number.isNaN(parsed) || parsed <= 0) {
      return { field: 'amount', message: bahtInputError(input.amountBaht, 'จำนวนเงิน') ?? 'จำนวนเงินต้องมากกว่า 0' }
    }
    amountSatang = parsed
  }
  if (input.isHotel && parseHotelNightsInput(input.nightsText) === null) {
    return { field: 'nights', message: HOTEL_NIGHTS_RANGE_MESSAGE }
  }
  if (input.newSubstitute) {
    if (input.linesError !== null) return { field: 'lines', message: input.linesError }
    if (amountSatang !== null && input.linesTotalSatang > amountSatang) {
      return {
        field: 'amount',
        message: `ยอดรวมรายการของใบรับรอง (${fmtSatangSymbol(input.linesTotalSatang)}) ต้องไม่เกินจำนวนเงินที่เบิก`,
      }
    }
  }
  if (input.cancelsActive && input.cancelReason.trim().length < SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN) {
    return {
      field: 'cancelReason',
      message: `กรอกเหตุผลการยกเลิกใบรับรองเดิมอย่างน้อย ${SUBSTITUTE_RECEIPT_CANCEL_REASON_MIN} ตัวอักษร`,
    }
  }
  if (input.receiptMissing) return { field: 'receipt', message: 'แนบไฟล์ใบเสร็จก่อนส่ง' }
  if (input.note.trim() === '') return { field: 'note', message: 'ต้องระบุสิ่งที่แก้ไขให้ผู้อนุมัติทราบ' }
  return null
}

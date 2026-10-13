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

/**
 * เหตุผลปิดงานไม่สำเร็จ (มติ PO 03/10/2569 — UAT Q16 · BUG-057 · `41` §6.4/§12) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * - ปิดงาน `closed_fail` ต้องเลือกเหตุผล 1 ข้อจากรายการนี้ · เลือก "อื่น ๆ" (`other`) ต้องอธิบายเพิ่ม
 * - DB เก็บ **รหัส** เป็น TEXT (`case_evidences.fail_reason`) ไม่ใช่ PG enum โดยตั้งใจ ⇒ PO ปรับ/เพิ่ม/เลิกใช้
 *   รายการได้ที่ไฟล์นี้ไฟล์เดียวโดยไม่ต้องแก้ schema — รหัสที่เลิกใช้แล้วยังอ่านกลับได้ (ป้ายตกไปที่รหัสดิบ)
 * - ⚠️ ห้ามเปลี่ยนความหมายของรหัสเดิม (ข้อมูลย้อนหลังอ้างรหัสนี้อยู่) — จะเปลี่ยนให้เพิ่มรหัสใหม่แทน
 */

export const CLOSE_FAIL_REASONS = [
  'debtor_not_found',
  'debtor_refused',
  'moved_unreachable',
  'asset_lost_damaged',
  'other',
] as const

export type CloseFailReason = (typeof CLOSE_FAIL_REASONS)[number]

/** รหัสที่บังคับให้อธิบายเพิ่ม */
export const CLOSE_FAIL_REASON_OTHER: CloseFailReason = 'other'

export const CLOSE_FAIL_REASON_LABEL: Readonly<Record<CloseFailReason, string>> = {
  debtor_not_found: 'ไม่พบลูกหนี้',
  debtor_refused: 'ลูกหนี้ปฏิเสธคืน',
  moved_unreachable: 'ย้ายที่อยู่ติดต่อไม่ได้',
  asset_lost_damaged: 'ทรัพย์สูญหายหรือเสียหาย',
  other: 'อื่น ๆ (ระบุ)',
}

export function isCloseFailReason(value: string): value is CloseFailReason {
  return (CLOSE_FAIL_REASONS as readonly string[]).includes(value)
}

/** ป้ายของรหัสที่เก็บไว้ — รหัสที่เลิกใช้แล้ว/ไม่รู้จักคืนรหัสดิบ (ห้ามซ่อนข้อมูลเดิม) */
export function closeFailReasonLabel(code: string): string {
  return isCloseFailReason(code) ? CLOSE_FAIL_REASON_LABEL[code] : code
}

/** ข้อความสรุป "เหตุผล — คำอธิบาย" สำหรับแสดงผล · ไม่มีเหตุผล = `null` */
export function closeFailReasonText(code: string | null, detail: string | null): string | null {
  if (code === null) return null
  const label = code === CLOSE_FAIL_REASON_OTHER ? 'อื่น ๆ' : closeFailReasonLabel(code)
  const trimmed = (detail ?? '').trim()
  return trimmed === '' ? label : `${label} — ${trimmed}`
}

/**
 * ครบตามกติกาไหม: ต้องมีรหัส · เลือก "อื่น ๆ" ต้องมีคำอธิบายที่ไม่ใช่ช่องว่าง
 * (ตัวเรียกใช้ทั้งฟอร์มและ API คือ `missingCloseEvidence()` — ห้ามเช็คซ้ำที่อื่น)
 */
export function isCloseFailReasonComplete(code: string | null | undefined, detail: string | null | undefined): boolean {
  if (code === null || code === undefined || code === '') return false
  if (code === CLOSE_FAIL_REASON_OTHER) return (detail ?? '').trim() !== ''
  return true
}

/** ค่าที่เก็บลงหลักฐาน — เคสสำเร็จไม่มีเหตุผล · คำอธิบายว่าง = `null` */
export function closeFailReasonForStorage(
  outcome: 'closed_success' | 'closed_fail',
  code: string | null | undefined,
  detail: string | null | undefined,
): { failReason: string | null; failReasonDetail: string | null } {
  if (outcome !== 'closed_fail' || code === null || code === undefined || code === '') {
    return { failReason: null, failReasonDetail: null }
  }
  const trimmed = (detail ?? '').trim()
  return { failReason: code, failReasonDetail: trimmed === '' ? null : trimmed }
}

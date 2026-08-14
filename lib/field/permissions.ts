/**
 * สิทธิ์ของ Field Tracker (`41` §13 · `25` §7) — **pure ล้วน**
 *
 * ทุก endpoint ของไฟล์ 41 ผูกกับ capability เดียว: `perform_field_work`
 * - อ่าน (list/detail/มุมมองทีม) = `view`
 * - รับงาน/จัดวัน/เช็คอิน/draft/ปิดงาน = `manage`
 *
 * scope ระดับแถวบังคับเพิ่มที่ชั้น query เสมอ (พนักงานเห็นเฉพาะเคสตัวเอง · มุมมองทีม = ทีมเดียวกัน read-only)
 */
export const FIELD_CAPABILITY = 'perform_field_work'

/** ตีกลับหลักฐานปิดงานเป็นสิทธิ์ของ **เจ้าหน้าที่อนุมัติเคส** เท่านั้น (`41` §8/§10.1 — ใช้ใน Phase 2.9) */
export const FIELD_REJECT_EVIDENCE_CAPABILITY = 'reject_evidence'

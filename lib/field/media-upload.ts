import { sanitizeFileName, type UploadCandidate } from '@/lib/cases/document-upload'

/**
 * กติกาไฟล์หลักฐานปิดงานภาคสนาม (`41` §6.4 · §8 `add_photo`/`add_video`) — **pure ล้วน**
 *
 * ไฟล์จริงขึ้น **Supabase Storage** จากฝั่ง browser ก่อน (ดู `lib/field/upload-client.ts`)
 * แล้วส่งเฉพาะ **path** เข้า `close-draft` / `close` / `resubmit-close` ซึ่งเก็บเป็น `text[]`
 * ⇒ ใช้ bucket เดียวกับเอกสารเคส (`case-documents`) คนละ prefix เพื่อไม่ต้องตั้ง bucket ใหม่ต่อ environment
 *
 * ⚠️ ตัวตรวจในไฟล์นี้เป็น **UX guard ฝั่งฟอร์ม** (ชนิด/ขนาดไฟล์ไม่ใช่ error code ของ `24`)
 * กติกาธุรกิจจริง (ต้องมีรูป ≥1 / วิดีโอ ≥1 / รูปสินค้าเฉพาะสำเร็จ) บังคับที่ `evidence.ts` ทั้ง FE/BE
 */

export const FIELD_MEDIA_KINDS = ['photo', 'video', 'product_photo', 'audio'] as const
export type FieldMediaKind = (typeof FIELD_MEDIA_KINDS)[number]

export const FIELD_MEDIA_LABEL: Readonly<Record<FieldMediaKind, string>> = {
  photo: 'รูปถ่าย',
  video: 'วิดีโอ',
  product_photo: 'รูปสินค้ายืนยัน',
  audio: 'เสียงบันทึกการสนทนา',
}

/** ค่า `accept` ของ `<input type="file">` — ปล่อยกว้างระดับหมวด เพราะกล้อง/ไมค์ของแต่ละเครื่องให้ชนิดต่างกัน */
export const FIELD_MEDIA_ACCEPT: Readonly<Record<FieldMediaKind, string>> = {
  photo: 'image/*',
  video: 'video/*',
  product_photo: 'image/*',
  audio: 'audio/*',
}

/** ค่า `capture` ของ `<input type="file">` — เปิดกล้อง/ไมค์ของอุปกรณ์ตรง ๆ บนมือถือ (`41` §8) */
export const FIELD_MEDIA_CAPTURE: Readonly<Record<FieldMediaKind, 'environment' | 'user' | null>> = {
  photo: 'environment',
  video: 'environment',
  product_photo: 'environment',
  audio: null,
}

const MB = 1024 * 1024

/** เพดานขนาดต่อไฟล์ฝั่งฟอร์ม — วิดีโอ/เสียงจากกล้องมือถือใหญ่กว่ารูปมาก จึงคนละเพดาน */
export const FIELD_MEDIA_MAX_BYTES: Readonly<Record<FieldMediaKind, number>> = {
  photo: 10 * MB,
  video: 100 * MB,
  product_photo: 10 * MB,
  audio: 50 * MB,
}

const MIME_PREFIX: Readonly<Record<FieldMediaKind, string>> = {
  photo: 'image/',
  video: 'video/',
  product_photo: 'image/',
  audio: 'audio/',
}

export function isFieldMediaMime(kind: FieldMediaKind, mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith(MIME_PREFIX[kind])
}

/** ตรวจไฟล์ก่อนอัปโหลด — คืน**ข้อความภาษาไทย**เมื่อไม่ผ่าน หรือ `null` เมื่อผ่าน */
export function checkFieldMediaCandidate(kind: FieldMediaKind, file: UploadCandidate): string | null {
  // เบราว์เซอร์บางตัวไม่ส่ง MIME ของไฟล์ที่อัดจากกล้อง (`type` ว่าง) — ปล่อยผ่านแล้วให้ขนาดเป็นตัวกรอง
  if (file.type !== '' && !isFieldMediaMime(kind, file.type)) {
    return `“${FIELD_MEDIA_LABEL[kind]}” รับเฉพาะไฟล์${kind === 'video' ? 'วิดีโอ' : kind === 'audio' ? 'เสียง' : 'รูปภาพ'} — ไฟล์ ${file.name} ไม่รองรับ`
  }
  if (file.size > FIELD_MEDIA_MAX_BYTES[kind]) {
    return `ไฟล์ ${file.name} ใหญ่เกิน ${Math.floor(FIELD_MEDIA_MAX_BYTES[kind] / MB)} MB`
  }
  if (file.size <= 0) return `ไฟล์ ${file.name} ว่างเปล่า`
  return null
}

/**
 * path ใน bucket — แยกตามเคสและชนิดสื่อ เพื่อให้ไล่ไฟล์ย้อนหลังได้จากชื่อ path อย่างเดียว
 * `uniqueKey` ให้ผู้เรียกส่งเข้ามา (`crypto.randomUUID()`) เพื่อให้ฟังก์ชันนี้ยัง pure/เทสต์ได้
 */
export function fieldEvidencePath(
  caseId: string,
  kind: FieldMediaKind,
  fileName: string,
  uniqueKey: string,
): string {
  return `cases/${caseId}/field_evidence/${kind}/${uniqueKey}-${sanitizeFileName(fileName)}`
}

import { DOCUMENT_SLOT_LABEL, type DocumentSlot } from '@/lib/cases/case'

/**
 * กติกาการแนบไฟล์ของเคส (`38` §6.3 · §6.3.1 · ไฟล์ 01 object storage rule) — **pure ล้วน**
 *
 * ไฟล์จริงขึ้น **Supabase Storage** จากฝั่ง browser ก่อน แล้วจึงส่ง metadata
 * (`fileUrl` + `fileHash` SHA-256) เข้า `POST /api/cases/:id/documents` ตามที่ endpoint ของ 2.2 รับไว้
 *
 * ⚠️ ตัวตรวจในไฟล์นี้เป็น **UX guard ฝั่งฟอร์มเท่านั้น** (ชนิด/ขนาดไฟล์ไม่ผ่าน API layer)
 * ส่วนที่เป็นกติกาธุรกิจจริง (เพดานรูปสินค้า 8 รูป) บังคับที่ `assertProductPhotoCapacity()`
 * ทั้งฝั่ง FE และ API — ห้ามย้ายมาไว้ที่นี่
 */

/** bucket ของ Supabase Storage — ต้องสร้างไว้ 1 ครั้งต่อ environment (ดูหมายเหตุใน PROGRESS) */
export const CASE_DOCUMENT_BUCKET = 'case-documents'

/** เพดานขนาดไฟล์ต่อชิ้นฝั่งฟอร์ม — กันผู้ใช้รออัปโหลดนานแล้วค่อยพัง (ไม่ใช่ error code ของ `24`) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
const DOCUMENT_MIMES = ['application/pdf', ...IMAGE_MIMES] as const

/** ชนิดไฟล์ที่รับต่อ slot — รูปสินค้าเป็นรูปเท่านั้น (`38` §6.3.1 แสดง thumbnail grid) */
export const SLOT_ACCEPTED_MIMES: Readonly<Record<DocumentSlot, readonly string[]>> = {
  contract_doc: DOCUMENT_MIMES,
  national_id_doc: DOCUMENT_MIMES,
  other_doc: DOCUMENT_MIMES,
  product_photo: IMAGE_MIMES,
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export function isPdfMime(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

export function isAcceptedMime(slot: DocumentSlot, mimeType: string): boolean {
  return SLOT_ACCEPTED_MIMES[slot].includes(mimeType.toLowerCase())
}

/** ค่า `accept` ของ `<input type="file">` ต่อ slot */
export function acceptAttribute(slot: DocumentSlot): string {
  return SLOT_ACCEPTED_MIMES[slot].join(',')
}

export interface UploadCandidate {
  name: string
  type: string
  size: number
}

/**
 * ตรวจไฟล์ก่อนอัปโหลด — คืน **ข้อความภาษาไทย** เมื่อไม่ผ่าน หรือ `null` เมื่อผ่าน
 * (ไม่โยน `CaseError` เพราะไม่ใช่ error code ตาม `24` — เป็นการเตือนระดับฟอร์ม)
 */
export function checkUploadCandidate(slot: DocumentSlot, file: UploadCandidate): string | null {
  if (!isAcceptedMime(slot, file.type)) {
    const kinds = slot === 'product_photo' ? 'รูปภาพ (JPG/PNG/WebP/HEIC)' : 'PDF หรือรูปภาพ'
    return `“${DOCUMENT_SLOT_LABEL[slot]}” รับเฉพาะ${kinds} — ไฟล์ ${file.name} ไม่รองรับ`
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `ไฟล์ ${file.name} ใหญ่เกิน ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`
  }
  if (file.size <= 0) return `ไฟล์ ${file.name} ว่างเปล่า`
  return null
}

/**
 * ตัดอักขระที่ทำให้ key ของ Storage เพี้ยน — เหลือเฉพาะ ASCII `A-Za-z0-9._-`
 * (ชื่อจริงเก็บไว้ที่ `original_name` อยู่แล้ว ส่วนนี้แค่ช่วยให้ไล่ไฟล์ใน bucket ได้)
 * นามสกุลไฟล์ถูกรักษาไว้เสมอเพื่อให้เดา content-type ได้
 */
export function sanitizeFileName(name: string): string {
  const normalized = name.normalize('NFC')
  const matched = /\.([A-Za-z0-9]{1,10})$/.exec(normalized)
  const extension = matched === null ? '' : `.${(matched[1] ?? '').toLowerCase()}`
  const base = (matched === null ? normalized : normalized.slice(0, -extension.length))
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
  return base === '' ? `file${extension}` : `${base}${extension}`
}

/**
 * path ใน bucket — แยกตามเคสและ slot เพื่อให้ตามรอยไฟล์ได้จากชื่อ path อย่างเดียว
 * `uniqueKey` ให้ผู้เรียกส่งเข้ามา (`crypto.randomUUID()`) เพื่อให้ฟังก์ชันนี้ยัง pure/เทสต์ได้
 */
export function storagePath(caseId: string, slot: DocumentSlot, fileName: string, uniqueKey: string): string {
  return `cases/${caseId}/${slot}/${uniqueKey}-${sanitizeFileName(fileName)}`
}

/** SHA-256 hex 64 ตัวของไฟล์ (ไฟล์ 01) — ใช้ Web Crypto ได้ทั้ง browser และ Node 20+ */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

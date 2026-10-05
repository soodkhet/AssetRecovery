import type { DocumentSlot } from '@/lib/cases/case'
import { MAX_UPLOAD_BYTES, maxUploadBytes } from '@/lib/cases/document-upload'
import { advanceReturnFilePrefix } from '@/lib/advances/return-file'
import { creditNoteFilePrefix } from '@/lib/credit-notes/file'
import { EXPENSE_RECEIPT_MAX_BYTES, FIELD_MEDIA_MAX_BYTES, type FieldMediaKind } from '@/lib/field/media-upload'
import { AUDIO_KINDS, DOCUMENT_KINDS, IMAGE_KINDS, VIDEO_KINDS, type FileKind, type UploadRule } from '@/lib/uploads/inspect'
import { lotDocumentPrefix } from '@/lib/warehouse/lot-documents'
import type { LotDocument } from '@/lib/warehouse/lot-status'

/**
 * กติกาไฟล์ของแต่ละฟีเจอร์ที่ server ใช้ตรวจ (มติ PO 03/10/2569 — UAT Q13) — prefix ตรงกับ path ที่
 * ตัวอัปโหลดฝั่ง browser สร้าง (`storagePath()` / `fieldEvidencePath()` / `intakePhotoPath()` / `lotDocumentPath()`)
 * เพดานขนาดเท่ากับที่ฟอร์มเตือน (ฟอร์มเป็น UX · ที่นี่คือตัวบังคับจริง)
 *
 * ⚠️ ฝั่ง server เท่านั้น (ลาก `node:crypto` ผ่าน `inspect.ts`)
 */

/** เอกสารเคสต่อ slot — เอกสารชุด (`bundle_doc`) รับ PDF/รูปเหมือนช่องเอกสาร แต่เพดาน 25 MB (มติ PO 04/10/2569) */
export function caseDocumentRule(caseId: string, slot: DocumentSlot): UploadRule {
  return {
    prefix: `cases/${caseId}/${slot}/`,
    accept: slot === 'product_photo' ? IMAGE_KINDS : DOCUMENT_KINDS,
    maxBytes: maxUploadBytes(slot),
  }
}

const FIELD_MEDIA_KINDS_ACCEPT: Readonly<Record<FieldMediaKind, readonly FileKind[]>> = {
  photo: IMAGE_KINDS,
  product_photo: IMAGE_KINDS,
  video: VIDEO_KINDS,
  audio: AUDIO_KINDS,
}

export function fieldEvidenceRule(caseId: string, kind: FieldMediaKind): UploadRule {
  return {
    prefix: `cases/${caseId}/field_evidence/${kind}/`,
    accept: FIELD_MEDIA_KINDS_ACCEPT[kind],
    maxBytes: FIELD_MEDIA_MAX_BYTES[kind],
  }
}

/** ไฟล์ทั้งชุดของหลักฐานปิดงาน → รายการที่ต้องตรวจ (แต่ละช่องคนละ prefix/ชนิด) */
export function fieldEvidenceFiles(
  caseId: string,
  media: {
    photos: readonly string[]
    videos: readonly string[]
    productPhotos: readonly string[]
    audioUrl?: string | null
  },
): Array<{ path: string; rule: UploadRule }> {
  const of = (kind: FieldMediaKind, paths: readonly string[]) =>
    paths.map((path) => ({ path, rule: fieldEvidenceRule(caseId, kind) }))
  return [
    ...of('photo', media.photos),
    ...of('video', media.videos),
    ...of('product_photo', media.productPhotos),
    ...of('audio', media.audioUrl === undefined || media.audioUrl === null ? [] : [media.audioUrl]),
  ]
}

/** รูปหลักฐานรับเข้าคลัง 7 มุม — `assets/<assetId>/intake/<angle>/…` (เพดานเท่ารูปภาคสนาม) */
export function intakePhotoRule(assetId: string): UploadRule {
  return { prefix: `assets/${assetId}/intake/`, accept: IMAGE_KINDS, maxBytes: FIELD_MEDIA_MAX_BYTES.photo }
}

/** เอกสารล็อตส่งมอบ — path ต่อเวอร์ชัน `handover-lots/<lotId>/<ชนิด>/<uuid>.<ext>` (ไม่ทับของเดิม) */
export function lotDocumentRule(lotId: string, document: LotDocument): UploadRule {
  return { prefix: lotDocumentPrefix(lotId, document), accept: DOCUMENT_KINDS, maxBytes: MAX_UPLOAD_BYTES }
}

/**
 * ใบเสร็จรายการเบิกแยก (ที่พัก — `41` §6.6) — `expenses/<userId ผู้เบิก>/receipts/…` ตาม `expenseReceiptPath()`
 * แยกตามผู้เบิก ไม่ใช่ตามรายการ เพราะอัปโหลดก่อนรายการเกิด · รับรูป/PDF ≤ 10 MB (ขยายมติ Q13 — UAT BUG-072)
 */
export function expenseReceiptRule(userId: string): UploadRule {
  return { prefix: `expenses/${userId}/receipts/`, accept: DOCUMENT_KINDS, maxBytes: EXPENSE_RECEIPT_MAX_BYTES }
}

/** ไฟล์สแกนใบลดหนี้ (มติ PO U14) — `tax-invoices/<taxInvoiceId>/credit-notes/…` รับ PDF/รูป เพดานเท่าเอกสารล็อต */
export function creditNoteFileRule(taxInvoiceId: string): UploadRule {
  return { prefix: creditNoteFilePrefix(taxInvoiceId), accept: DOCUMENT_KINDS, maxBytes: MAX_UPLOAD_BYTES }
}

/** หลักฐานรับคืนเงินทดรองแยก (มติ PO U30) — `advances/<advanceId>/returns/…` รับ PDF/รูป */
export function advanceReturnFileRule(advanceId: string): UploadRule {
  return { prefix: advanceReturnFilePrefix(advanceId), accept: DOCUMENT_KINDS, maxBytes: MAX_UPLOAD_BYTES }
}

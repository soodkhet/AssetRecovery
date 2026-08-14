import { MAX_UPLOAD_BYTES, isAcceptedMime, type UploadCandidate } from '@/lib/cases/document-upload'
import type { HandoverLotStatus, HandoverType } from '@/lib/generated/prisma/enums'
import { isLotConfirmed, requiredLotDocuments, type LotDocument } from '@/lib/warehouse/lot-status'

/**
 * เอกสารแนบของล็อตส่งมอบ (`44` §6.4 · §8.4 modal "แนบเอกสาร" · §8.5 modal "ดูเอกสารที่แนบ")
 * — **pure ล้วน** (ตัวอัปโหลดจริงอยู่ `lib/warehouse/upload-client.ts` ฝั่ง browser)
 *
 * `44` §6.4 กำหนด path ไว้เป็น `handover-lots/{lotId}/signed-doc.pdf` และ
 * `handover-lots/{lotId}/delivery-proof.{ext}` ⇒ ที่นี่คงชื่อไฟล์ตายตัวตามนั้น แต่ให้ **นามสกุลเดินตาม
 * ไฟล์จริง** (ใบเซ็นรับที่สแกนมาอาจเป็นรูปถ่าย ไม่ใช่ PDF เสมอไป — mockup รับ `.pdf,image/*`)
 * ⇒ 1 ล็อต = 1 ไฟล์ต่อชนิดเอกสารเสมอ แนบทับได้ก่อนยืนยัน (หลัง `confirmed` ล็อตเป็น terminal แก้ไม่ได้)
 */

export const LOT_DOCUMENT_LABEL: Readonly<Record<LotDocument, string>> = {
  signed_doc: 'ใบส่งมอบที่มีลายเซ็นผู้รับ',
  delivery_proof: 'หลักฐานส่งพัสดุ / Delivered',
}

/** คำอธิบายใต้ช่องอัปโหลด (`44` §8.4) — บอกว่าเอกสารแต่ละชิ้นได้มาอย่างไร */
export const LOT_DOCUMENT_HINT: Readonly<Record<LotDocument, string>> = {
  signed_doc: 'พิมพ์ใบส่งมอบจากระบบ ให้ผู้รับเซ็น แล้วสแกน/ถ่ายรูปแนบกลับ',
  delivery_proof: 'ใบเสร็จส่งพัสดุ / ภาพหน้าจอสถานะ Delivered / รูปถ่ายตอนส่ง',
}

/** ลำดับที่แสดงบนหน้าจอ — ① ใบเซ็นรับ ② หลักฐานจัดส่ง (`44` §6.3) */
export const LOT_DOCUMENT_ORDINAL: Readonly<Record<LotDocument, string>> = {
  signed_doc: '①',
  delivery_proof: '②',
}

/** ชื่อไฟล์ตายตัวใน bucket ต่อชนิดเอกสาร (`44` §6.4) */
const LOT_DOCUMENT_BASENAME: Readonly<Record<LotDocument, string>> = {
  signed_doc: 'signed-doc',
  delivery_proof: 'delivery-proof',
}

/** ชนิดไฟล์ที่รับ — เดียวกับ mockup §8.4 (`.pdf,image/*`) */
export const LOT_DOCUMENT_ACCEPT = 'application/pdf,image/*'

const DEFAULT_EXTENSION = 'pdf'

/** นามสกุลไฟล์แบบปลอดภัยสำหรับ key ของ Storage — ไม่มี/แปลก = ถอยไปใช้ `pdf` */
export function documentExtension(fileName: string): string {
  const matched = /\.([A-Za-z0-9]{1,10})$/.exec(fileName.normalize('NFC'))
  const extension = matched?.[1]?.toLowerCase()
  return extension === undefined || extension === '' ? DEFAULT_EXTENSION : extension
}

/** path ใน bucket ตาม `44` §6.4 — 1 ล็อต = 1 ไฟล์ต่อชนิด (แนบใหม่ = ทับไฟล์เดิม) */
export function lotDocumentPath(lotId: string, document: LotDocument, fileName: string): string {
  return `handover-lots/${lotId}/${LOT_DOCUMENT_BASENAME[document]}.${documentExtension(fileName)}`
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const

/**
 * เดา mime จาก path เพื่อส่งให้ `<FileViewerModal>` เลือกวิธีแสดง (iframe หรือรูป)
 * — ไฟล์ที่แนบไว้แล้วเก็บแค่ path (`handover_lots.signed_doc_url`) ไม่มีคอลัมน์ mime ให้จำ
 */
export function lotDocumentMime(path: string): string {
  const extension = documentExtension(path)
  if (extension === 'pdf') return 'application/pdf'
  const image = IMAGE_EXTENSIONS.find((each) => each === extension)
  return image === undefined ? 'application/octet-stream' : `image/${image === 'jpg' ? 'jpeg' : image}`
}

/**
 * ตรวจไฟล์ก่อนอัปโหลด — คืน **ข้อความภาษาไทย** เมื่อไม่ผ่าน หรือ `null` เมื่อผ่าน
 * (ไม่ใช่ error code ตาม `24` — เป็นการเตือนระดับฟอร์ม แนวเดียวกับ `checkUploadCandidate()` ของ 2.5)
 * ชนิด/ขนาดที่รับ = ชุดเดียวกับเอกสารแนบเคส (PDF หรือรูปภาพ ไม่เกิน 10 MB)
 */
export function checkLotDocumentCandidate(document: LotDocument, file: UploadCandidate): string | null {
  if (!isAcceptedMime('other_doc', file.type)) {
    return `“${LOT_DOCUMENT_LABEL[document]}” รับเฉพาะ PDF หรือรูปภาพ — ไฟล์ ${file.name} ไม่รองรับ`
  }
  if (file.size > MAX_UPLOAD_BYTES) return `ไฟล์ ${file.name} ใหญ่เกิน ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`
  if (file.size <= 0) return `ไฟล์ ${file.name} ว่างเปล่า`
  return null
}

export interface LotDocumentSlot {
  document: LotDocument
  label: string
  hint: string
  ordinal: string
  /** path ในbucket — `null` = ยังไม่แนบ */
  fileUrl: string | null
  attached: boolean
}

/**
 * รายการเอกสารที่ล็อตนี้ต้องมี พร้อมสถานะแนบแล้ว/รอแนบ (`44` §8.5 การ์ด ✅/⏳)
 * — ใช้ได้ทั้งกับ `LotSummaryDto` (การ์ด ไม่มี url) และ `LotDetailDto` (modal มี url):
 *   ล็อตที่ `confirmed` ถือว่าเอกสารครบเสมอตามนิยาม §6.3 แม้ผู้เรียกไม่มีข้อมูล url
 */
export function lotDocumentSlots(lot: {
  type: HandoverType
  status: HandoverLotStatus
  signedDocUrl?: string | null
  deliveryProofUrl?: string | null
}): LotDocumentSlot[] {
  const urls: Readonly<Record<LotDocument, string | null>> = {
    signed_doc: emptyToNull(lot.signedDocUrl),
    delivery_proof: emptyToNull(lot.deliveryProofUrl),
  }
  return requiredLotDocuments(lot.type).map((document) => ({
    document,
    label: LOT_DOCUMENT_LABEL[document],
    hint: LOT_DOCUMENT_HINT[document],
    ordinal: LOT_DOCUMENT_ORDINAL[document],
    fileUrl: urls[document],
    attached: urls[document] !== null || isLotConfirmed(lot.status),
  }))
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code ของการตรวจไฟล์ที่อัปโหลด (มติ PO 03/10/2569 — UAT Q13 · BUG-037/050) — SSOT `24` §6.3
 *
 * ใช้ร่วมทุกจุดที่ browser อัปโหลดไฟล์ขึ้น Storage แล้วส่ง path มาให้ server ผูกกับข้อมูล:
 * เอกสารเคส (`38`) · หลักฐานปิดงาน (`41`) · รูปรับเข้าคลัง + เอกสารล็อตส่งมอบ (`44`)
 *
 * ⚠️ Rule 04: ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลง `24` + `lib/api/error-catalog.ts` ในคอมมิตเดียวกัน
 * **pure ล้วน** — ห้าม import อะไรที่แตะ Prisma/Storage
 */

export const UPLOAD_ERROR_CODES = [
  'UPLOAD_PATH_OUT_OF_SCOPE',
  'UPLOAD_FILE_NOT_FOUND',
  'UPLOAD_HASH_MISMATCH',
  'UPLOAD_FILE_TYPE_INVALID',
  'UPLOAD_FILE_TOO_LARGE',
] as const

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number]

const HTTP_STATUS: Record<UploadErrorCode, number> = {
  UPLOAD_PATH_OUT_OF_SCOPE: 400,
  UPLOAD_FILE_NOT_FOUND: 400,
  UPLOAD_HASH_MISMATCH: 400,
  UPLOAD_FILE_TYPE_INVALID: 400,
  UPLOAD_FILE_TOO_LARGE: 400,
}

const MESSAGES: Record<UploadErrorCode, ErrorMessage> = {
  UPLOAD_PATH_OUT_OF_SCOPE: {
    title: 'ที่อยู่ไฟล์ไม่ถูกต้อง',
    message: 'ไฟล์ที่แนบไม่ได้อยู่ในพื้นที่เก็บไฟล์ของรายการนี้ — กรุณาอัปโหลดไฟล์ใหม่จากหน้าจอนี้',
  },
  UPLOAD_FILE_NOT_FOUND: {
    title: 'ไม่พบไฟล์ที่แนบ',
    message: 'ระบบไม่พบไฟล์ในที่เก็บไฟล์ — อาจอัปโหลดไม่สำเร็จ กรุณาแนบไฟล์ใหม่อีกครั้ง',
  },
  UPLOAD_HASH_MISMATCH: {
    title: 'ไฟล์ไม่ตรงกับที่อัปโหลด',
    message: 'ค่าตรวจสอบของไฟล์ไม่ตรงกับไฟล์ที่ระบบได้รับ — กรุณาแนบไฟล์ใหม่อีกครั้ง',
  },
  UPLOAD_FILE_TYPE_INVALID: {
    title: 'ชนิดไฟล์ไม่รองรับ',
    message: 'เนื้อไฟล์ไม่ตรงกับชนิดที่ช่องนี้รับ (เช่น รูปภาพ / วิดีโอ / เสียง / PDF) — กรุณาเลือกไฟล์ที่ถูกต้อง',
  },
  UPLOAD_FILE_TOO_LARGE: {
    title: 'ไฟล์ใหญ่เกินกำหนด',
    message: 'ขนาดไฟล์เกินเพดานที่ช่องนี้รับ — กรุณาลดขนาดไฟล์แล้วแนบใหม่',
  },
}

export function uploadErrorStatus(code: UploadErrorCode): number {
  return HTTP_STATUS[code]
}

export function uploadErrorMessage(code: UploadErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class UploadError extends ModuleError<UploadErrorCode> {
  constructor(code: UploadErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'UploadError'
  }
}

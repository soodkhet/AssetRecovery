import type { DocumentSlot } from '@/lib/cases/case'
import {
  CASE_DOCUMENT_BUCKET,
  sha256Hex,
  storagePath,
} from '@/lib/cases/document-upload'
import type { CaseDocumentUploadInput } from '@/lib/cases/schemas'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * อัปโหลดไฟล์แนบของเคสขึ้น Supabase Storage แล้วคืน metadata สำหรับ
 * `POST /api/cases/:id/documents` (`38` §6.3 · ไฟล์ 01 object storage rule)
 *
 * ⚠️ ฝั่ง browser เท่านั้น (ใช้ `File`/`crypto.subtle`/anon key) — ห้าม import เข้า route handler
 * ⚠️ ต้องสร้าง bucket `case-documents` ไว้ก่อน 1 ครั้งต่อ environment (ดูหมายเหตุใน PROGRESS)
 *
 * การตรวจสิทธิ์จริงยังอยู่ที่ API layer เสมอ (DEC-002) — endpoint `case.uploadDocument`
 * ตรวจ `manage:record_admin_data` + สถานะเคสก่อนผูกไฟล์เข้าเคส
 */
export class CaseUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CaseUploadError'
  }
}

export async function uploadCaseFile(
  caseId: string,
  slot: DocumentSlot,
  file: File,
): Promise<CaseDocumentUploadInput> {
  const buffer = await file.arrayBuffer()
  const fileHash = await sha256Hex(buffer)
  const path = storagePath(caseId, slot, file.name, crypto.randomUUID())

  const supabase = createSupabaseBrowserClient()
  const uploaded = await supabase.storage.from(CASE_DOCUMENT_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploaded.error !== null) {
    throw new CaseUploadError(`อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ — ${uploaded.error.message}`)
  }

  // bucket เป็น private ⇒ เก็บ path ไว้ แล้วขอ signed URL ตอนเปิดดู (`38` §7.5 doc viewer)
  return {
    documentType: slot,
    fileUrl: uploaded.data.path,
    fileHash,
    originalName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }
}

/** signed URL สำหรับเปิดดูไฟล์ที่แนบไว้ (หมดอายุใน 1 ชม.) — คืน `null` เมื่อขอไม่ได้ */
export async function signedFileUrl(fileUrl: string): Promise<string | null> {
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl
  const supabase = createSupabaseBrowserClient()
  const signed = await supabase.storage.from(CASE_DOCUMENT_BUCKET).createSignedUrl(fileUrl, 3600)
  return signed.error === null ? signed.data.signedUrl : null
}

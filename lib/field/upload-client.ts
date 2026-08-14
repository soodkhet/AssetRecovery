import { CASE_DOCUMENT_BUCKET } from '@/lib/cases/document-upload'
import {
  checkExpenseReceiptCandidate,
  checkFieldMediaCandidate,
  expenseReceiptPath,
  fieldEvidencePath,
  type FieldMediaKind,
} from '@/lib/field/media-upload'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * อัปโหลดไฟล์หลักฐานปิดงานขึ้น Supabase Storage แล้วคืน **path** ที่จะส่งเข้า
 * `close-draft` / `close` / `resubmit-close` (`41` §6.4 · `45` §6.3)
 *
 * ⚠️ ฝั่ง browser เท่านั้น (ใช้ `File`/`crypto.randomUUID()`/anon key) — ห้าม import เข้า route handler
 * ⚠️ ใช้ bucket `case-documents` ตัวเดิมของ 2.5 (ไม่ต้องสร้าง bucket ใหม่ต่อ environment)
 *
 * การตรวจสิทธิ์จริงยังอยู่ที่ API layer เสมอ (DEC-002) — endpoint ปิดงานตรวจ `perform_field_work`
 * + `loadOwnAssignment()` ว่าเป็นเคสของผู้เรียกเองก่อนผูกไฟล์เข้าเคส
 */
export class FieldUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldUploadError'
  }
}

export async function uploadFieldMedia(caseId: string, kind: FieldMediaKind, file: File): Promise<string> {
  const problem = checkFieldMediaCandidate(kind, { name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new FieldUploadError(problem)

  const path = fieldEvidencePath(caseId, kind, file.name, crypto.randomUUID())
  const supabase = createSupabaseBrowserClient()
  const uploaded = await supabase.storage.from(CASE_DOCUMENT_BUCKET).upload(path, file, {
    contentType: file.type === '' ? undefined : file.type,
    upsert: false,
  })
  if (uploaded.error !== null) {
    throw new FieldUploadError(`อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ — ${uploaded.error.message}`)
  }

  // bucket เป็น private ⇒ เก็บ path ไว้ แล้วขอ signed URL ตอนเปิดดู (`signedFileUrl()` ของ 2.5)
  return uploaded.data.path
}

/**
 * อัปโหลดใบเสร็จของรายการเบิกแยก (`41` §6.6) แล้วคืน path ที่ส่งเข้า
 * `POST /api/field/expenses/hotel` หรือ `POST /api/field/expenses/:id/resubmit`
 */
export async function uploadExpenseReceipt(userId: string, file: File): Promise<string> {
  const problem = checkExpenseReceiptCandidate({ name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new FieldUploadError(problem)

  const path = expenseReceiptPath(userId, file.name, crypto.randomUUID())
  const supabase = createSupabaseBrowserClient()
  const uploaded = await supabase.storage.from(CASE_DOCUMENT_BUCKET).upload(path, file, {
    contentType: file.type === '' ? undefined : file.type,
    upsert: false,
  })
  if (uploaded.error !== null) {
    throw new FieldUploadError(`อัปโหลดใบเสร็จไม่สำเร็จ — ${uploaded.error.message}`)
  }
  return uploaded.data.path
}

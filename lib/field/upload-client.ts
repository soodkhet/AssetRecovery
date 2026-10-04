import {
  checkExpenseReceiptCandidate,
  checkFieldMediaCandidate,
  type FieldMediaKind,
} from '@/lib/field/media-upload'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'
import type { UploadTarget } from '@/lib/uploads/targets'

/**
 * อัปโหลดไฟล์หลักฐานปิดงานขึ้น Supabase Storage แล้วคืน **path** ที่จะส่งเข้า
 * `close-draft` / `close` / `resubmit-close` (`41` §6.4 · `45` §6.3)
 *
 * ⚠️ ฝั่ง browser เท่านั้น — ห้าม import เข้า route handler
 * ⚠️ ใช้ bucket `case-documents` ตัวเดิมของ 2.5 (ไม่ต้องสร้าง bucket ใหม่ต่อ environment)
 *
 * อัปโหลดผ่านโทเคนที่ server ออกให้ (BUG-143 · DEC-014) — ออกให้เฉพาะผู้ถือ assignment ของเคสเอง
 * แล้ว endpoint ปิดงานตรวจ `perform_field_work` + `loadOwnAssignment()` + ตัวไฟล์อีกชั้นก่อนผูกเข้าเคส (DEC-002)
 */
export class FieldUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldUploadError'
  }
}

async function upload(target: UploadTarget, file: File): Promise<string> {
  try {
    return await uploadToStorage(target, file)
  } catch (error) {
    if (error instanceof StorageUploadError) throw new FieldUploadError(error.message)
    throw error
  }
}

export async function uploadFieldMedia(caseId: string, kind: FieldMediaKind, file: File): Promise<string> {
  const problem = checkFieldMediaCandidate(kind, { name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new FieldUploadError(problem)
  // bucket เป็น private ⇒ เก็บ path ไว้ แล้วขอ signed URL จาก server ตอนเปิดดู (`signedFileUrl()`)
  return upload({ kind: 'field_evidence', caseId, mediaKind: kind }, file)
}

/**
 * อัปโหลดใบเสร็จของรายการเบิกแยก (`41` §6.6) แล้วคืน path ที่ส่งเข้า
 * `POST /api/field/expenses/hotel` หรือ `POST /api/field/expenses/:id/resubmit`
 * — path อยู่ใต้ผู้เรียกเสมอ (server ใช้ผู้ใช้ของ session ไม่รับ userId จาก browser)
 */
export async function uploadExpenseReceipt(file: File): Promise<string> {
  const problem = checkExpenseReceiptCandidate({ name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new FieldUploadError(problem)
  return upload({ kind: 'expense_receipt' }, file)
}

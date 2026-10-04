import type { DocumentSlot } from '@/lib/cases/case'
import { sha256Hex } from '@/lib/cases/document-upload'
import type { CaseDocumentUploadInput } from '@/lib/cases/schemas'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * อัปโหลดไฟล์แนบของเคสขึ้น Supabase Storage แล้วคืน metadata สำหรับ
 * `POST /api/cases/:id/documents` (`38` §6.3 · ไฟล์ 01 object storage rule)
 *
 * ⚠️ ฝั่ง browser เท่านั้น (ใช้ `File`/`crypto.subtle`) — ห้าม import เข้า route handler
 *
 * อัปโหลดผ่านโทเคนที่ server ออกให้หลังตรวจ `manage:record_admin_data` + scope ของเคส (BUG-143 · DEC-014)
 * แล้ว endpoint `case.uploadDocument` ตรวจไฟล์ + สถานะเคสอีกชั้นก่อนผูกไฟล์เข้าเคส (DEC-002)
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
  const fileHash = await sha256Hex(await file.arrayBuffer())
  let path: string
  try {
    path = await uploadToStorage({ kind: 'case_document', caseId, slot }, file)
  } catch (error) {
    if (error instanceof StorageUploadError) throw new CaseUploadError(error.message)
    throw error
  }

  // bucket เป็น private ⇒ เก็บ path ไว้ แล้วขอ signed URL จาก server ตอนเปิดดู (`38` §7.5 doc viewer)
  return {
    documentType: slot,
    fileUrl: path,
    fileHash,
    originalName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }
}

/** ส่งต่อจาก `lib/uploads/client.ts` — ผู้เรียกเดิม (ตัวเปิดดูไฟล์ · หลักฐานภาคสนาม) ไม่ต้องเปลี่ยน import */
export { signedFileUrl } from '@/lib/uploads/client'

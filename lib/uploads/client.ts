import { callApi, jsonRequest } from '@/lib/api/types'
import { CASE_DOCUMENT_BUCKET } from '@/lib/cases/document-upload'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  STORAGE_API_PATH,
  type SignedDownloadDto,
  type SignedUploadDto,
  type UploadTarget,
} from '@/lib/uploads/targets'

/**
 * ทางเดียวที่ browser แตะ bucket `case-documents` (BUG-143 · DEC-014)
 *
 * - อัปโหลด: ขอโทเคนต่อ path จาก server (ตรวจสิทธิ์ + scope + ประกอบ path ให้) → `uploadToSignedUrl()`
 * - เปิดดู: ขอ signed URL อายุสั้นจาก server (ตรวจสิทธิ์ตามเจ้าของ path)
 *
 * ห้ามเรียก `storage.from(...).upload()` / `createSignedUrl()` ตรงจากฝั่ง client — bucket ไม่มี policy ให้
 * `authenticated` แล้ว (เทสต์ `client-storage-scan.test.ts` สแกนกันไว้)
 *
 * ⚠️ ฝั่ง browser เท่านั้น
 */

export class StorageUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageUploadError'
  }
}

/** อัปโหลดไฟล์เข้า target แล้วคืน **path** ที่ server ประกอบให้ — error มีข้อความพร้อมแสดงผู้ใช้ */
export async function uploadToStorage(target: UploadTarget, file: File): Promise<string> {
  const issued = await callApi<SignedUploadDto>(
    STORAGE_API_PATH.uploadUrl,
    jsonRequest('POST', { target, fileName: file.name, sizeBytes: file.size }),
  )
  if (issued.error !== undefined || issued.data === undefined) {
    throw new StorageUploadError(`อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ — ${issued.error?.message ?? 'ขอสิทธิ์อัปโหลดไม่ได้'}`)
  }

  const supabase = createSupabaseBrowserClient()
  const uploaded = await supabase.storage
    .from(CASE_DOCUMENT_BUCKET)
    .uploadToSignedUrl(issued.data.path, issued.data.token, file, {
      contentType: file.type === '' ? undefined : file.type,
    })
  if (uploaded.error !== null) {
    throw new StorageUploadError(`อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ — ${uploaded.error.message}`)
  }
  return issued.data.path
}

/**
 * signed URL ชั่วคราวสำหรับเปิดดูไฟล์ที่แนบไว้ — คืน `null` เมื่อไม่มีสิทธิ์/ไม่พบไฟล์
 * ลิงก์ภายนอก (`http(s)://`) ส่งคืนตามเดิม (ไม่ใช่ไฟล์ใน bucket)
 */
export async function signedFileUrl(fileUrl: string): Promise<string | null> {
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl
  const signed = await callApi<SignedDownloadDto>(STORAGE_API_PATH.downloadUrl, jsonRequest('POST', { path: fileUrl }))
  return signed.error === undefined && signed.data !== undefined ? signed.data.url : null
}

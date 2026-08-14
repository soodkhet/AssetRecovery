import { CASE_DOCUMENT_BUCKET } from '@/lib/cases/document-upload'
import { checkFieldMediaCandidate } from '@/lib/field/media-upload'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { intakePhotoPath } from '@/lib/warehouse/intake-photos'
import type { IntakePhotoAngle } from '@/lib/warehouse/intake'

/**
 * อัปโหลดรูปหลักฐานตอนรับเข้าคลัง (`44` §8.2 ขั้น 3/3) แล้วคืน **path** ที่จะส่งเข้า
 * `POST /api/assets/:id/intake` (`photos[]`)
 *
 * ⚠️ ฝั่ง browser เท่านั้น (ใช้ `File`/`crypto.randomUUID()`/anon key) — ห้าม import เข้า route handler
 * ⚠️ ใช้ bucket `case-documents` ตัวเดิมของ 2.5 (ไม่ต้องสร้าง bucket ใหม่ต่อ environment)
 *
 * การตรวจสิทธิ์จริงยังอยู่ที่ API layer เสมอ (DEC-002) — endpoint intake ตรวจ `manage:intake_asset`
 * + scope ของเครื่องก่อนผูก path เข้า `assets.photos`
 */
export class WarehouseUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WarehouseUploadError'
  }
}

/** เพดาน/ชนิดไฟล์เท่ากับรูปหลักฐานภาคสนาม (`lib/field/media-upload.ts`) — รูปจากกล้องเครื่องเดียวกัน */
export const INTAKE_PHOTO_ACCEPT = 'image/*'

export async function uploadIntakePhoto(assetId: string, angle: IntakePhotoAngle, file: File): Promise<string> {
  const problem = checkFieldMediaCandidate('photo', { name: file.name, type: file.type, size: file.size })
  if (problem !== null) throw new WarehouseUploadError(problem)

  const path = intakePhotoPath(assetId, angle, file.name, crypto.randomUUID())
  const supabase = createSupabaseBrowserClient()
  const uploaded = await supabase.storage.from(CASE_DOCUMENT_BUCKET).upload(path, file, {
    contentType: file.type === '' ? undefined : file.type,
    upsert: false,
  })
  if (uploaded.error !== null) {
    throw new WarehouseUploadError(`อัปโหลดรูป ${file.name} ไม่สำเร็จ — ${uploaded.error.message}`)
  }

  // bucket เป็น private ⇒ เก็บ path ไว้ แล้วขอ signed URL ตอนเปิดดู (`signedFileUrl()` ของ 2.5)
  return uploaded.data.path
}

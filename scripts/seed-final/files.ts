import { sampleFileBytes } from './runtime'

/**
 * ไฟล์ตัวอย่างของ seed (โลโก้/ลายเซ็น/หลักฐาน/เอกสาร) — path ต้องอยู่ใต้ prefix ของแต่ละช่อง (lib/uploads/rules.ts)
 * - ปกติ (ระหว่างพัฒนา): ไม่แตะ Storage — stub `downloadUploadedFile` คืนไบต์ตัวอย่างตามนามสกุล (ตัวตรวจจริงยังทำงาน)
 * - `--with-storage`: อัปโหลดไบต์เดียวกันขึ้น bucket `case-documents` ก่อนส่ง path ให้ service
 */

let realStorage = false

export function enableRealStorage(enabled: boolean): void {
  realStorage = enabled
}

export async function stored(path: string): Promise<string> {
  if (!realStorage) return path
  const { createSupabaseAdminClient } = await import('@/lib/supabase/server')
  const { CASE_DOCUMENT_BUCKET } = await import('@/lib/cases/document-upload')
  const ext = (path.split('.').pop() ?? 'pdf').toLowerCase()
  const contentType = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : ext === 'mp4' ? 'video/mp4' : 'application/pdf'
  const { error } = await createSupabaseAdminClient()
    .storage.from(CASE_DOCUMENT_BUCKET)
    .upload(path, sampleFileBytes(path), { contentType, upsert: true })
  if (error !== null) throw new Error(`อัปโหลดไฟล์ตัวอย่าง ${path} ไม่สำเร็จ: ${error.message}`)
  return path
}

export async function storedAll(paths: readonly string[]): Promise<string[]> {
  const result: string[] = []
  for (const path of paths) result.push(await stored(path))
  return result
}

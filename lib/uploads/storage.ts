import { CASE_DOCUMENT_BUCKET } from '@/lib/cases/document-upload'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

/**
 * ทางเข้า bucket `case-documents` ฝั่ง server ทั้งหมด — ใช้ **service role** เสมอ (BUG-143 · DEC-014)
 *
 * bucket นี้ไม่มี policy ให้ role `authenticated` แล้ว ⇒ browser แตะ object ได้ทางเดียวคือ URL/โทเคนชั่วคราว
 * ที่ออกจากโมดูลนี้ **หลัง** route ตรวจสิทธิ์ + scope แล้ว (`lib/uploads/access.ts`)
 *
 * ⚠️ ฝั่ง server เท่านั้น · เทสต์ต้อง mock โมดูลนี้ (ห้ามยิง Storage จริง — Rule 07)
 */

/** อายุ signed URL สำหรับเปิดดู/ดาวน์โหลด (วินาที) — สั้นพอที่ลิงก์หลุดแล้วใช้ต่อไม่ได้นาน */
export const SIGNED_DOWNLOAD_TTL_SECONDS = 300

/** อ่านไฟล์ที่ browser อัปโหลดขึ้นมาเพื่อตรวจก่อนผูกเข้าข้อมูล (`verify.ts` — มติ PO 03/10/2569 UAT Q13) */
export async function downloadUploadedFile(path: string): Promise<Uint8Array | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(CASE_DOCUMENT_BUCKET).download(path)
  if (error !== null || data === null) return null
  return new Uint8Array(await data.arrayBuffer())
}

export interface SignedUpload {
  path: string
  token: string
}

/**
 * ออกโทเคนอัปโหลด **ต่อ path เดียว** (ไม่ทับของเดิม — `upsert: false`) · browser ใช้กับ `uploadToSignedUrl()`
 * ซึ่งไม่ต้องพึ่ง policy ของ `storage.objects` (ทำงานได้ทั้งก่อน/หลังถอด policy เก่า)
 */
export async function createSignedUpload(path: string): Promise<SignedUpload | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(CASE_DOCUMENT_BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error !== null || data === null) return null
  return { path: data.path, token: data.token }
}

/** signed URL อายุสั้นสำหรับเปิดดูไฟล์ — `null` เมื่อไม่มีไฟล์/ออกไม่ได้ */
export async function createSignedDownloadUrl(path: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from(CASE_DOCUMENT_BUCKET)
    .createSignedUrl(path, SIGNED_DOWNLOAD_TTL_SECONDS)
  if (error !== null || data === null) return null
  return data.signedUrl
}

/** จำนวน path สูงสุดต่อคำสั่งลบหนึ่งครั้ง — กัน request ใหญ่เกินของ Storage API */
const REMOVE_BATCH_SIZE = 100

/**
 * ลบไฟล์ออกจาก bucket ถาวร — ใช้กับงานลบเอกสารลูกหนี้ตามนโยบายระยะเก็บ (PDPA — มติ PO U97) เท่านั้น
 *
 * - path ที่ไม่มีไฟล์อยู่แล้ว **ไม่ถือว่าผิด** (Storage ไม่คืน error) ⇒ รันซ้ำได้ (idempotent)
 * - คำสั่งชุดใดล้มเหลว ⇒ path ชุดนั้นอยู่ใน `failed` ให้ผู้เรียกข้าม/ลองใหม่รอบหน้า ไม่ throw
 */
export async function removeStoredFiles(paths: readonly string[]): Promise<{ removed: string[]; failed: string[] }> {
  const result: { removed: string[]; failed: string[] } = { removed: [], failed: [] }
  if (paths.length === 0) return result
  const supabase = createSupabaseAdminClient()
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const chunk = paths.slice(index, index + REMOVE_BATCH_SIZE)
    const { error } = await supabase.storage.from(CASE_DOCUMENT_BUCKET).remove(chunk)
    if (error === null) result.removed.push(...chunk)
    else result.failed.push(...chunk)
  }
  return result
}

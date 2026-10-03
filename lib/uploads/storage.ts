import { CASE_DOCUMENT_BUCKET } from '@/lib/cases/document-upload'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

/**
 * อ่านไฟล์ที่ browser อัปโหลดขึ้น bucket `case-documents` ด้วย **service role** (มติ PO 03/10/2569 — UAT Q13)
 *
 * ⚠️ ฝั่ง server เท่านั้น · ใช้ตรวจไฟล์ก่อนผูกเข้าข้อมูล (`verify.ts`) — ไม่แจก signed URL ให้ใคร
 * ⚠️ เทสต์ต้อง mock โมดูลนี้ (ห้ามยิง Storage จริง — Rule 07)
 */
export async function downloadUploadedFile(path: string): Promise<Uint8Array | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(CASE_DOCUMENT_BUCKET).download(path)
  if (error !== null || data === null) return null
  return new Uint8Array(await data.arrayBuffer())
}

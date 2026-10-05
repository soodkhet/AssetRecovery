import { createHash } from 'node:crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { ZipEntry } from '@/lib/exports/zip'

/**
 * ที่เก็บ Accounting Pack (ไฟล์ 37) — Supabase Storage **bucket private** `accounting-packs`
 *
 * ⚠️ ต้องสร้าง bucket `accounting-packs` (private) ไว้ก่อน **1 ครั้งต่อ environment** เหมือน
 *    `payment-files` ของ 3.4 — ไม่มี bucket = Export ไม่ผ่านและขึ้นข้อความบอกให้สร้างก่อน
 * ⚠️ **ห้าม overwrite เด็ดขาด** (`upsert: false` + path เดินตาม version — `37` §10 / Rule 09):
 *    ชุดที่ส่งสำนักงานบัญชีไปแล้วต้องเปิดย้อนดูได้ตรงกับที่ส่งจริงเสมอ
 * ⚠️ ดาวน์โหลดผ่าน endpoint ของเราเอง (`GET /api/accounting/export-history/:id/download`)
 *    ไม่แจก signed URL ให้ browser — ชุดนี้คือข้อมูลการเงินทั้งงวด ต้องผ่าน `requirePermission()` ทุกครั้ง
 */

export const ACCOUNTING_PACK_BUCKET = 'accounting-packs'

export class PackStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackStorageError'
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * ลายนิ้วมือของ **เนื้อข้อมูล** ในชุด (ไฟล์ 01–14) — ผูกชื่อไฟล์กับ hash ของเนื้อไฟล์ตามลำดับ
 * ⇒ คำนวณซ้ำจากไฟล์ที่แตกออกมาได้เอง ไม่ต้องเชื่อ zip · ใช้พิมพ์บนหน้าปกซึ่งอยู่ในชุดเดียวกัน
 * (hash ของ `.zip` ทั้งก้อนพิมพ์บนหน้าปกไม่ได้เพราะหน้าปกอยู่ในไฟล์ zip นั้นเอง)
 */
export function packContentDigest(entries: readonly ZipEntry[]): string {
  const hash = createHash('sha256')
  for (const entry of entries) {
    hash.update(entry.name)
    hash.update('\0')
    hash.update(sha256Hex(entry.data))
    hash.update('\n')
  }
  return hash.digest('hex')
}

export async function uploadPackFile(input: {
  path: string
  bytes: Uint8Array
  contentType: string
}): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage.from(ACCOUNTING_PACK_BUCKET).upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  })
  if (error !== null) {
    throw new PackStorageError(
      `อัปโหลดไฟล์ชุดส่งบัญชีไม่สำเร็จ — ${error.message} ` +
        `(ตรวจว่าสร้าง bucket "${ACCOUNTING_PACK_BUCKET}" แบบ private ไว้แล้วหรือยัง)`,
    )
  }
}

/**
 * ลบไฟล์ของ "ครั้งที่พยายาม" ที่ล้มกลางทาง — **best-effort** ใช้เก็บกวาดเฉพาะ path ที่เพิ่งอัปโหลด
 * ใน attempt เดียวกัน (ยังไม่มีแถว `export_records` อ้าง) ไม่ใช่การลบชุดที่ส่งมอบแล้ว (Rule 09)
 *
 * คืนรายชื่อ path ที่ลบไม่สำเร็จ — ผู้เรียก log ไว้ให้คนตามเก็บ ห้ามโยน error ทับสาเหตุจริง
 */
export async function removePackFiles(paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.storage.from(ACCOUNTING_PACK_BUCKET).remove([...paths])
    return error === null ? [] : [...paths]
  } catch {
    return [...paths]
  }
}

export async function downloadPackFile(path: string): Promise<Uint8Array> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(ACCOUNTING_PACK_BUCKET).download(path)
  if (error !== null || data === null) {
    throw new PackStorageError(`อ่านไฟล์ชุดส่งบัญชีไม่สำเร็จ — ${error?.message ?? 'ไม่พบไฟล์'}`)
  }
  return new Uint8Array(await data.arrayBuffer())
}

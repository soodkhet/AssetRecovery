import type { Prisma } from '@/lib/generated/prisma/client'
import { UploadError } from '@/lib/uploads/errors'
import { assertUploadPathInScope, inspectUploadedBytes, type UploadRule, type VerifiedUpload } from '@/lib/uploads/inspect'
import { isUploadPathReferenced } from '@/lib/uploads/references'
import { downloadUploadedFile, removeStoredFiles } from '@/lib/uploads/storage'

/**
 * ตรวจไฟล์ที่อัปโหลดแล้วฝั่ง server ครบวงจร (มติ PO 03/10/2569 — UAT Q13 · BUG-037/050)
 *
 * prefix → ดาวน์โหลดด้วย service role (ต้องมีจริง) → ขนาด/ชนิดจาก magic bytes → SHA-256 ของ server
 *
 * ⚠️ เรียก **นอก** `$transaction` เสมอ (I/O เครือข่าย — ห้ามถือ transaction ค้าง)
 */

/** path → ข้อมูลที่ตรวจแล้ว — เก็บเป็น JSONB (`file_hashes` / `photo_hashes`) คู่กับรายการ path */
export type VerifiedUploadMap = Record<string, VerifiedUpload>

export interface VerifyUploadOptions {
  /**
   * path ของไฟล์ที่ผูกกับ record ที่กำลังแก้อยู่แล้ว (เช่นใบเสร็จเดิมของใบเบิกที่ส่งใหม่) — ไม่ใช่ไฟล์ใหม่ของคำขอนี้
   * ⇒ ถูกปฏิเสธก็ห้ามลบ (รีวิวเฟส 4 ข้อ 1) · ผู้เรียกที่แก้ record ที่มีไฟล์เดิมต้องส่งเสมอ
   */
  boundPaths?: ReadonlyArray<string | null | undefined>
}

export async function verifyUploadedFile(
  path: string,
  rule: UploadRule,
  claimedSha256?: string | null,
  options: VerifyUploadOptions = {},
): Promise<VerifiedUpload> {
  try {
    assertUploadPathInScope(path, rule.prefix)
    const bytes = await downloadUploadedFile(path)
    if (bytes === null) throw new UploadError('UPLOAD_FILE_NOT_FOUND', { detail: `path=${path}` })
    try {
      return inspectUploadedBytes(bytes, rule, claimedSha256)
    } catch (error) {
      await removeRejectedUpload(path, error, options)
      throw error
    }
  } catch (error) {
    throw withRejectedPath(error, path)
  }
}

/**
 * ไฟล์ที่เนื้อไม่ตรงชนิดที่รับ (mytester A-14) หรือใหญ่เกินเกณฑ์ (มติ 16/10/2569 Q5) ⇒ ลบทิ้งไม่ให้ค้างใน Storage
 * · เฉพาะ path ที่ผ่าน prefix ของผู้เรียกแล้ว · hash ไม่ตรง **ไม่ลบ** (อาจเป็นไฟล์เดิมที่ผูกอยู่แล้วถูกส่งซ้ำด้วยค่าผิด)
 * · ไฟล์ที่ผูกอยู่แล้ว (ข้อมูลเก่าที่ไม่เคยผ่านการตรวจ — `receipt_file_unverified`/`id_document_unverified` ·
 *   หรือเกณฑ์ขนาดเปลี่ยนภายหลัง) ไม่ถูกลบ — ลบได้เฉพาะไฟล์ที่ "เพิ่งอัปโหลดในคำขอนี้" ดู {@link removeRejectedUpload}
 */
const REMOVABLE_REJECTION_CODES: ReadonlySet<string> = new Set(['UPLOAD_FILE_TYPE_INVALID', 'UPLOAD_FILE_TOO_LARGE'])

export function shouldRemoveRejectedUpload(error: unknown): boolean {
  return error instanceof UploadError && REMOVABLE_REJECTION_CODES.has(error.code)
}

/**
 * ลบเฉพาะไฟล์ใหม่ของคำขอนี้ (รีวิวเฟส 4 ข้อ 1): ไม่ใช่ไฟล์เดิมของ record ที่กำลังแก้ (`boundPaths`) และไม่มี record
 * ใดอ้าง path นี้ (`isUploadPathReferenced`) · ตรวจการอ้างอิงไม่สำเร็จ ⇒ ไม่ลบ (ปลอดภัยไว้ก่อน)
 */
async function removeRejectedUpload(path: string, error: unknown, options: VerifyUploadOptions): Promise<void> {
  if (!shouldRemoveRejectedUpload(error)) return
  if (options.boundPaths?.includes(path) === true) return
  try {
    if (await isUploadPathReferenced(path)) return
  } catch (referenceError: unknown) {
    console.error('[uploads] ตรวจการอ้างอิงไฟล์ไม่สำเร็จ — ไม่ลบไฟล์', { path, error: referenceError })
    return
  }
  try {
    const { failed } = await removeStoredFiles([path])
    if (failed.length > 0) console.error('[uploads] ลบไฟล์ที่ถูกปฏิเสธไม่สำเร็จ', { path })
  } catch (removeError: unknown) {
    // ลบไม่สำเร็จต้องไม่บัง error เดิมที่ผู้ใช้ต้องเห็น
    console.error('[uploads] ลบไฟล์ที่ถูกปฏิเสธไม่สำเร็จ', { path, error: removeError })
  }
}

/**
 * แนบ `path` ของไฟล์ที่ถูกปัดไปกับ error (กระจายลง payload ของ API เป็น `path`) — ฟอร์มใช้เอาไฟล์นั้นออก
 * แล้วบอกผู้ใช้ว่าไฟล์ไหนถูกปัด แทนการถือไว้แล้ว autosave ล้มซ้ำ (UAT BUG-070) · path เป็นไฟล์ของผู้เรียกเอง
 */
function withRejectedPath(error: unknown, path: string): unknown {
  if (!(error instanceof UploadError) || error.context?.['path'] !== undefined) return error
  return new UploadError(error.code, { detail: error.detail, context: { ...error.context, path } })
}

/**
 * ตรวจหลายไฟล์ตามกติกาของแต่ละไฟล์ — path ที่อยู่ใน `known` (ตรวจแล้วโดย server ครั้งก่อน เช่น draft
 * หรือหลักฐานชุดก่อน) ใช้ค่าเดิมโดยไม่ดาวน์โหลดซ้ำ แต่ยังต้องผ่าน prefix เสมอ
 * คืน map ของ **path ที่ส่งมาเท่านั้น** (ของเก่าที่ไม่ได้ใช้แล้วหลุดออกเอง)
 */
export async function verifyUploadedFiles(
  files: ReadonlyArray<{ path: string; rule: UploadRule }>,
  known: Readonly<VerifiedUploadMap> = {},
  options: VerifyUploadOptions = {},
): Promise<VerifiedUploadMap> {
  const result: VerifiedUploadMap = {}
  for (const { path, rule } of files) {
    // path ซ้ำ (เช่นไฟล์เดียวกันในสองช่อง) ยังต้องผ่าน prefix ของช่องนั้นเสมอ
    if (result[path] !== undefined) {
      assertPathInScopeOrReject(path, rule)
      continue
    }
    const previous = known[path]
    if (previous !== undefined) {
      assertPathInScopeOrReject(path, rule)
      result[path] = previous
      continue
    }
    result[path] = await verifyUploadedFile(path, rule, null, options)
  }
  return result
}

function assertPathInScopeOrReject(path: string, rule: UploadRule): void {
  try {
    assertUploadPathInScope(path, rule.prefix)
  } catch (error) {
    throw withRejectedPath(error, path)
  }
}

/** อ่าน JSONB ที่เก็บไว้กลับเป็น map — ค่าที่รูปไม่ตรงถูกทิ้ง (ถือว่ายังไม่เคยตรวจ) */
export function toVerifiedUploadMap(value: unknown): VerifiedUploadMap {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: VerifiedUploadMap = {}
  for (const [path, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (typeof record['sha256'] === 'string' && typeof record['mimeType'] === 'string' && typeof record['sizeBytes'] === 'number') {
      result[path] = { sha256: record['sha256'], mimeType: record['mimeType'], sizeBytes: record['sizeBytes'] }
    }
  }
  return result
}

/** map → ค่า JSONB ที่ส่งเข้า Prisma */
export function uploadMapJson(map: Readonly<VerifiedUploadMap>): Prisma.InputJsonValue {
  const json: Record<string, Prisma.InputJsonObject> = {}
  for (const [path, entry] of Object.entries(map)) {
    json[path] = { sha256: entry.sha256, mimeType: entry.mimeType, sizeBytes: entry.sizeBytes }
  }
  return json
}

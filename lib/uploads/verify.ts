import type { Prisma } from '@/lib/generated/prisma/client'
import { UploadError } from '@/lib/uploads/errors'
import { assertUploadPathInScope, inspectUploadedBytes, type UploadRule, type VerifiedUpload } from '@/lib/uploads/inspect'
import { downloadUploadedFile } from '@/lib/uploads/storage'

/**
 * ตรวจไฟล์ที่อัปโหลดแล้วฝั่ง server ครบวงจร (มติ PO 03/10/2569 — UAT Q13 · BUG-037/050)
 *
 * prefix → ดาวน์โหลดด้วย service role (ต้องมีจริง) → ขนาด/ชนิดจาก magic bytes → SHA-256 ของ server
 *
 * ⚠️ เรียก **นอก** `$transaction` เสมอ (I/O เครือข่าย — ห้ามถือ transaction ค้าง)
 */

/** path → ข้อมูลที่ตรวจแล้ว — เก็บเป็น JSONB (`file_hashes` / `photo_hashes`) คู่กับรายการ path */
export type VerifiedUploadMap = Record<string, VerifiedUpload>

export async function verifyUploadedFile(
  path: string,
  rule: UploadRule,
  claimedSha256?: string | null,
): Promise<VerifiedUpload> {
  try {
    assertUploadPathInScope(path, rule.prefix)
    const bytes = await downloadUploadedFile(path)
    if (bytes === null) throw new UploadError('UPLOAD_FILE_NOT_FOUND', { detail: `path=${path}` })
    return inspectUploadedBytes(bytes, rule, claimedSha256)
  } catch (error) {
    throw withRejectedPath(error, path)
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
    result[path] = await verifyUploadedFile(path, rule)
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

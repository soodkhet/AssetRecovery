import { createHash } from 'node:crypto'
import { UploadError } from '@/lib/uploads/errors'

/**
 * ตรวจไฟล์ที่ browser อัปโหลดขึ้น Storage **ฝั่ง server** (มติ PO 03/10/2569 — UAT Q13 · BUG-037/050)
 * — **pure** (ไม่แตะ Storage/DB · ใช้ `node:crypto` คำนวณ SHA-256 ⇒ ฝั่ง server เท่านั้น)
 *
 * กติกา:
 * 1. path ต้องอยู่ใต้ prefix ของรายการนั้น (`cases/<caseId>/…`, `assets/<assetId>/…`, `handover-lots/<lotId>/…`)
 *    และห้ามมี `..`/`\`/`/` นำหน้า — ตรวจ**ก่อน**ดาวน์โหลด
 * 2. ชนิดไฟล์ตัดสินจาก **magic bytes** ของเนื้อไฟล์ ไม่ใช่นามสกุล/MIME ที่ browser บอก
 * 3. ขนาดไม่เกินเพดานของฟีเจอร์ · ไฟล์ว่าง = ชนิดไม่รองรับ
 * 4. SHA-256 คำนวณจากเนื้อไฟล์เอง — browser ส่งค่ามาด้วยและไม่ตรง ⇒ ปฏิเสธ (ไม่เชื่อค่าจาก browser)
 */

export const FILE_KINDS = [
  'pdf',
  'jpeg',
  'png',
  'webp',
  'heic',
  'mp4',
  'mov',
  'webm',
  '3gp',
  'm4a',
  'mp3',
  'wav',
  'ogg',
  'aac',
  'amr',
] as const

export type FileKind = (typeof FILE_KINDS)[number]

export const FILE_KIND_MIME: Readonly<Record<FileKind, string>> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  amr: 'audio/amr',
}

/** ชุดชนิดที่แต่ละฟีเจอร์รับ — ตรงกับ `accept` ของช่องอัปโหลดฝั่งฟอร์ม */
export const IMAGE_KINDS: readonly FileKind[] = ['jpeg', 'png', 'webp', 'heic']
export const DOCUMENT_KINDS: readonly FileKind[] = ['pdf', ...IMAGE_KINDS]
export const VIDEO_KINDS: readonly FileKind[] = ['mp4', 'mov', 'webm', '3gp']
/** ไฟล์เสียงจากมือถือ — m4a/mp4 ใช้ container เดียวกัน จึงรับ `mp4` ด้วย */
export const AUDIO_KINDS: readonly FileKind[] = ['m4a', 'mp4', '3gp', 'mp3', 'wav', 'ogg', 'webm', 'aac', 'amr']

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])
const M4A_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ', 'F4A ', 'F4B '])

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return ''
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

/** ชนิดไฟล์จาก magic bytes — ไม่รู้จัก = `null` */
export function detectFileKind(bytes: Uint8Array): FileKind | null {
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (ascii(bytes, 0, 4) === 'RIFF') {
    const format = ascii(bytes, 8, 4)
    if (format === 'WEBP') return 'webp'
    if (format === 'WAVE') return 'wav'
    return null
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (HEIF_BRANDS.has(brand)) return 'heic'
    if (brand === 'qt  ') return 'mov'
    if (M4A_BRANDS.has(brand)) return 'm4a'
    if (brand.startsWith('3gp') || brand.startsWith('3g2')) return '3gp'
    return 'mp4'
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm'
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg'
  if (ascii(bytes, 0, 5) === '#!AMR') return 'amr'
  if (ascii(bytes, 0, 3) === 'ID3') return 'mp3'
  const first = bytes[0]
  const second = bytes[1]
  if (first === 0xff && second !== undefined) {
    if ((second & 0xf6) === 0xf0) return 'aac'
    if ((second & 0xe0) === 0xe0) return 'mp3'
  }
  return null
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * path อยู่ใต้ prefix ของรายการนั้นจริงไหม — `prefix` ต้องลงท้ายด้วย `/` เสมอ
 * (กัน `cases/abc` จับคู่กับ `cases/abcdef/…`) · ปฏิเสธ `..` / `\` / `//` / path ว่างหลัง prefix
 */
export function assertUploadPathInScope(path: string, prefix: string): void {
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`
  const rest = path.startsWith(normalizedPrefix) ? path.slice(normalizedPrefix.length) : null
  const unsafe =
    rest === null ||
    rest === '' ||
    path.includes('\\') ||
    path.includes('//') ||
    path.split('/').some((segment) => segment === '..' || segment === '.')
  if (unsafe) {
    throw new UploadError('UPLOAD_PATH_OUT_OF_SCOPE', { detail: `path=${path} prefix=${normalizedPrefix}` })
  }
}

/** ข้อมูลไฟล์ที่ server ตรวจแล้ว — เก็บลง DB แทนค่าที่ browser บอก */
export interface VerifiedUpload {
  sha256: string
  mimeType: string
  sizeBytes: number
}

export interface UploadRule {
  /** prefix ของรายการ ต้องลงท้าย `/` เช่น `cases/<caseId>/contract_doc/` */
  prefix: string
  accept: readonly FileKind[]
  maxBytes: number
}

/** ตรวจเนื้อไฟล์ที่ดาวน์โหลดมาแล้ว (ขนาด → ชนิด → hash) */
export function inspectUploadedBytes(
  bytes: Uint8Array,
  rule: Pick<UploadRule, 'accept' | 'maxBytes'>,
  claimedSha256?: string | null,
): VerifiedUpload {
  if (bytes.length > rule.maxBytes) {
    throw new UploadError('UPLOAD_FILE_TOO_LARGE', {
      detail: `size=${bytes.length} max=${rule.maxBytes}`,
      context: { maxBytes: rule.maxBytes },
    })
  }
  const kind = bytes.length === 0 ? null : detectFileKind(bytes)
  if (kind === null || !rule.accept.includes(kind)) {
    throw new UploadError('UPLOAD_FILE_TYPE_INVALID', { detail: `kind=${kind ?? 'unknown'} accept=${rule.accept.join(',')}` })
  }
  const sha256 = sha256Hex(bytes)
  if (claimedSha256 !== undefined && claimedSha256 !== null && claimedSha256.toLowerCase() !== sha256) {
    throw new UploadError('UPLOAD_HASH_MISMATCH', { detail: `claimed=${claimedSha256} actual=${sha256}` })
  }
  return { sha256, mimeType: FILE_KIND_MIME[kind], sizeBytes: bytes.length }
}

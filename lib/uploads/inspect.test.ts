import { describe, expect, it } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import {
  AUDIO_KINDS,
  DOCUMENT_KINDS,
  IMAGE_KINDS,
  VIDEO_KINDS,
  assertUploadPathInScope,
  detectFileKind,
  inspectUploadedBytes,
  sha256Hex,
} from '@/lib/uploads/inspect'

/** มติ PO 03/10/2569 (UAT Q13 · BUG-037/050) — server ตรวจไฟล์ที่อัปโหลดเอง */

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new Uint8Array(Buffer.from(value))
const join = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap((part) => [...part]))
const ftyp = (brand: string) => join(bytes(0, 0, 0, 0x18), text('ftyp'), text(brand), text('....'))

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof ModuleError) return error.code
    throw error
  }
  return 'NO_ERROR'
}

describe('detectFileKind — ตัดสินจาก magic bytes ไม่ใช่นามสกุล', () => {
  it('เอกสาร/รูป', () => {
    expect(detectFileKind(text('%PDF-1.7\n...'))).toBe('pdf')
    expect(detectFileKind(bytes(0xff, 0xd8, 0xff, 0xe1, 0))).toBe('jpeg')
    expect(detectFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png')
    expect(detectFileKind(join(text('RIFF'), bytes(1, 2, 3, 4), text('WEBPVP8 ')))).toBe('webp')
    expect(detectFileKind(ftyp('heic'))).toBe('heic')
    expect(detectFileKind(ftyp('mif1'))).toBe('heic')
  })

  it('วิดีโอ/เสียง (ISO BMFF แยกตาม brand)', () => {
    expect(detectFileKind(ftyp('isom'))).toBe('mp4')
    expect(detectFileKind(ftyp('mp42'))).toBe('mp4')
    expect(detectFileKind(ftyp('qt  '))).toBe('mov')
    expect(detectFileKind(ftyp('M4A '))).toBe('m4a')
    expect(detectFileKind(ftyp('3gp5'))).toBe('3gp')
    expect(detectFileKind(bytes(0x1a, 0x45, 0xdf, 0xa3, 0))).toBe('webm')
    expect(detectFileKind(text('OggS\0'))).toBe('ogg')
    expect(detectFileKind(text('ID3\x04'))).toBe('mp3')
    expect(detectFileKind(bytes(0xff, 0xfb, 0x90))).toBe('mp3')
    expect(detectFileKind(bytes(0xff, 0xf1, 0x50))).toBe('aac')
    expect(detectFileKind(join(text('RIFF'), bytes(1, 2, 3, 4), text('WAVEfmt ')))).toBe('wav')
    expect(detectFileKind(text('#!AMR\n'))).toBe('amr')
  })

  it('ไฟล์ข้อความตั้งชื่อ .mp4 (เคส BUG-050) = ไม่รู้จัก', () => {
    expect(detectFileKind(text('this is not a video file at all'))).toBeNull()
    expect(detectFileKind(new Uint8Array())).toBeNull()
  })
})

describe('assertUploadPathInScope — path ต้องอยู่ใต้รายการนั้น', () => {
  const prefix = 'cases/c1/contract_doc/'

  it('ผ่านเมื่ออยู่ใต้ prefix', () => {
    expect(codeOf(() => assertUploadPathInScope('cases/c1/contract_doc/k-a.pdf', prefix))).toBe('NO_ERROR')
    expect(codeOf(() => assertUploadPathInScope('cases/c1/contract_doc/k-a.pdf', 'cases/c1/contract_doc'))).toBe('NO_ERROR')
  })

  it('เคสอื่น / slot อื่น / prefix ที่ขึ้นต้นเหมือนกัน / path traversal = UPLOAD_PATH_OUT_OF_SCOPE', () => {
    for (const path of [
      'cases/c2/contract_doc/a.pdf',
      'cases/c1/other_doc/a.pdf',
      'cases/c10/contract_doc/a.pdf',
      'cases/c1/contract_doc/../../c2/contract_doc/a.pdf',
      'cases/c1/contract_doc/',
      'cases/c1/contract_doc//a.pdf',
      'cases\\c1\\contract_doc\\a.pdf',
      'https://evil.example/a.pdf',
      '/cases/c1/contract_doc/a.pdf',
    ]) {
      expect(codeOf(() => assertUploadPathInScope(path, prefix)), path).toBe('UPLOAD_PATH_OUT_OF_SCOPE')
    }
  })
})

describe('inspectUploadedBytes — ขนาด → ชนิด → hash ของ server', () => {
  const pdf = text('%PDF-1.4 hello')

  it('คืน SHA-256 + MIME ที่ server ตรวจเอง (ไม่ใช้ค่าจาก browser)', () => {
    const result = inspectUploadedBytes(pdf, { accept: DOCUMENT_KINDS, maxBytes: 1000 })
    expect(result).toEqual({ sha256: sha256Hex(pdf), mimeType: 'application/pdf', sizeBytes: pdf.length })
  })

  it('browser ส่ง hash มาตรง = ผ่าน (ไม่สนตัวพิมพ์) · ไม่ตรง = UPLOAD_HASH_MISMATCH', () => {
    const actual = sha256Hex(pdf)
    expect(inspectUploadedBytes(pdf, { accept: DOCUMENT_KINDS, maxBytes: 1000 }, actual.toUpperCase()).sha256).toBe(actual)
    expect(codeOf(() => inspectUploadedBytes(pdf, { accept: DOCUMENT_KINDS, maxBytes: 1000 }, 'a'.repeat(64)))).toBe(
      'UPLOAD_HASH_MISMATCH',
    )
  })

  it('ชนิดไม่ตรงช่อง / ไฟล์ปลอม / ไฟล์ว่าง = UPLOAD_FILE_TYPE_INVALID', () => {
    expect(codeOf(() => inspectUploadedBytes(pdf, { accept: IMAGE_KINDS, maxBytes: 1000 }))).toBe('UPLOAD_FILE_TYPE_INVALID')
    expect(codeOf(() => inspectUploadedBytes(text('not a video'), { accept: VIDEO_KINDS, maxBytes: 1000 }))).toBe(
      'UPLOAD_FILE_TYPE_INVALID',
    )
    expect(codeOf(() => inspectUploadedBytes(new Uint8Array(), { accept: AUDIO_KINDS, maxBytes: 1000 }))).toBe(
      'UPLOAD_FILE_TYPE_INVALID',
    )
  })

  it('ใหญ่เกินเพดาน = UPLOAD_FILE_TOO_LARGE (ตรวจก่อนชนิด)', () => {
    expect(codeOf(() => inspectUploadedBytes(pdf, { accept: DOCUMENT_KINDS, maxBytes: 5 }))).toBe('UPLOAD_FILE_TOO_LARGE')
  })
})

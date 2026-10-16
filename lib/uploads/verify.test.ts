import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import { fieldEvidenceFiles, lotDocumentRule } from '@/lib/uploads/rules'
import {
  discardUnboundUpload,
  toVerifiedUploadMap,
  uploadMapJson,
  verifyUploadedFile,
  verifyUploadedFiles,
} from '@/lib/uploads/verify'
import { putFakeUpload, resetFakeUploads, sampleBytes, sha256Of, uploadTestState } from '@/tests/helpers/fake-uploads'

vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())

/** path ที่จำลองว่ามี record อ้างอยู่ (ของจริงอยู่ `references.ts` — เทสต์ DB ใน `receipt-upload.db.test.ts`) */
const referencedPaths = new Set<string>()
let referenceCheckFails = false
vi.mock('@/lib/uploads/references', () => ({
  isUploadPathReferenced: async (path: string) => {
    if (referenceCheckFails) throw new Error('db down')
    return referencedPaths.has(path)
  },
}))

/** มติ PO 03/10/2569 (UAT Q13 · BUG-037/050 · หนี้ #1) — server ตรวจไฟล์ที่อัปโหลดเองครบวงจร */

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    if (error instanceof ModuleError) return error.code
    throw error
  }
  return 'NO_ERROR'
}

beforeEach(() => {
  resetFakeUploads()
  referencedPaths.clear()
  referenceCheckFails = false
})

describe('verifyUploadedFile', () => {
  const rule = lotDocumentRule('lot-1', 'signed_doc')
  const path = 'handover-lots/lot-1/signed-doc/k1.pdf'

  it('ไฟล์มีจริง + ใต้ล็อต + PDF จริง = คืน hash ที่ server คำนวณ', async () => {
    const file = sampleBytes('pdf', 'signed')
    putFakeUpload(path, file)
    expect(await verifyUploadedFile(path, rule)).toEqual({
      sha256: sha256Of(file),
      mimeType: 'application/pdf',
      sizeBytes: file.length,
    })
  })

  it('ไม่มีไฟล์ใน Storage = UPLOAD_FILE_NOT_FOUND', async () => {
    expect(await codeOf(() => verifyUploadedFile(path, rule))).toBe('UPLOAD_FILE_NOT_FOUND')
  })

  it('path นอกล็อต = UPLOAD_PATH_OUT_OF_SCOPE (ไม่ต้องดาวน์โหลด)', async () => {
    putFakeUpload('handover-lots/lot-2/signed-doc/k.pdf', sampleBytes('pdf'))
    expect(await codeOf(() => verifyUploadedFile('handover-lots/lot-2/signed-doc/k.pdf', rule))).toBe(
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )
  })

  it('error แนบ path ของไฟล์ที่ถูกปัด ให้ฟอร์มเอาไฟล์นั้นออกได้ (UAT BUG-070)', async () => {
    putFakeUpload(path, sampleBytes('text'))
    const error = await verifyUploadedFile(path, rule).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ModuleError)
    expect((error as ModuleError<string>).context).toMatchObject({ path })
  })

  it('hash จาก browser ไม่ตรง = UPLOAD_HASH_MISMATCH', async () => {
    putFakeUpload(path, sampleBytes('pdf'))
    expect(await codeOf(() => verifyUploadedFile(path, rule, sha256Of('อื่น')))).toBe('UPLOAD_HASH_MISMATCH')
  })

  it('เนื้อไฟล์ไม่ตรงชนิด = ลบไฟล์ออกจาก Storage ไม่ให้ค้าง (mytester A-14)', async () => {
    putFakeUpload(path, sampleBytes('text'))
    expect(await codeOf(() => verifyUploadedFile(path, rule))).toBe('UPLOAD_FILE_TYPE_INVALID')
    expect(uploadTestState.removed).toEqual([path])
  })

  it('ไฟล์ใหญ่เกินเกณฑ์ = ลบไฟล์ออกจาก Storage ไม่ให้ค้าง (มติ 16/10/2569 Q5)', async () => {
    putFakeUpload(path, sampleBytes('pdf', 'x'.repeat(64)))
    expect(await codeOf(() => verifyUploadedFile(path, { ...rule, maxBytes: 16 }))).toBe('UPLOAD_FILE_TOO_LARGE')
    expect(uploadTestState.removed).toEqual([path])
  })

  it('ไฟล์ใหญ่เกินแต่เป็นไฟล์เดิมที่ผูกอยู่ (เกณฑ์ขนาดเปลี่ยนภายหลัง) ⇒ ไม่ลบ', async () => {
    putFakeUpload(path, sampleBytes('pdf', 'x'.repeat(64)))
    referencedPaths.add(path)
    expect(await codeOf(() => verifyUploadedFile(path, { ...rule, maxBytes: 16 }))).toBe('UPLOAD_FILE_TOO_LARGE')
    expect(await codeOf(() => verifyUploadedFile(path, { ...rule, maxBytes: 16 }, null, { boundPaths: [path] }))).toBe(
      'UPLOAD_FILE_TOO_LARGE',
    )
    expect(uploadTestState.removed).toEqual([])
  })

  it('hash ไม่ตรง / path นอกขอบเขต = ไม่ลบไฟล์ (อาจเป็นไฟล์ที่ผูกอยู่แล้ว)', async () => {
    putFakeUpload(path, sampleBytes('pdf'))
    await codeOf(() => verifyUploadedFile(path, rule, sha256Of('อื่น')))
    const outside = 'handover-lots/lot-2/signed-doc/k1.pdf'
    putFakeUpload(outside, sampleBytes('text'))
    expect(await codeOf(() => verifyUploadedFile(outside, rule))).toBe('UPLOAD_PATH_OUT_OF_SCOPE')
    expect(uploadTestState.removed).toEqual([])
  })

  it('ชนิดไม่ตรงแต่เป็นไฟล์เดิมของ record ที่กำลังแก้ (boundPaths) ⇒ ไม่ลบ (รีวิวเฟส 4 ข้อ 1)', async () => {
    putFakeUpload(path, sampleBytes('text'))
    expect(await codeOf(() => verifyUploadedFile(path, rule, null, { boundPaths: [null, path] }))).toBe(
      'UPLOAD_FILE_TYPE_INVALID',
    )
    expect(uploadTestState.removed).toEqual([])
  })

  it('ชนิดไม่ตรงแต่มี record อื่นอ้าง path อยู่ (ข้อมูลเก่าที่ไม่เคยตรวจ) ⇒ ไม่ลบ', async () => {
    putFakeUpload(path, sampleBytes('text'))
    referencedPaths.add(path)
    expect(await codeOf(() => verifyUploadedFile(path, rule))).toBe('UPLOAD_FILE_TYPE_INVALID')
    expect(uploadTestState.removed).toEqual([])
  })

  it('ตรวจการอ้างอิงไม่สำเร็จ ⇒ ไม่ลบ แต่ยังคืน error เดิม', async () => {
    putFakeUpload(path, sampleBytes('text'))
    referenceCheckFails = true
    expect(await codeOf(() => verifyUploadedFile(path, rule))).toBe('UPLOAD_FILE_TYPE_INVALID')
    expect(uploadTestState.removed).toEqual([])
  })

  it('ลบไม่สำเร็จยังคืน error เดิมให้ผู้ใช้', async () => {
    putFakeUpload(path, sampleBytes('text'))
    uploadTestState.failRemove.add(path)
    expect(await codeOf(() => verifyUploadedFile(path, rule))).toBe('UPLOAD_FILE_TYPE_INVALID')
  })
})

/** ตรวจ staging SV5-PC-04 — คำขอถูกปฏิเสธก่อนตรวจไฟล์ (งวดปิด) ⇒ ลบไฟล์ที่เพิ่งอัปโหลด */
describe('discardUnboundUpload', () => {
  const rule = lotDocumentRule('lot-1', 'signed_doc')
  const path = 'handover-lots/lot-1/signed-doc/k1.pdf'

  it('ไฟล์ใหม่ใน prefix ของผู้เรียก ไม่มี record อ้าง ⇒ ลบ', async () => {
    putFakeUpload(path, sampleBytes('pdf'))
    await discardUnboundUpload(path, rule)
    expect(uploadTestState.removed).toEqual([path])
  })

  it('มี record อ้างอยู่แล้ว / นอก prefix / ไม่มี path / ตรวจการอ้างอิงล้ม ⇒ ไม่ลบ ไม่โยน', async () => {
    referencedPaths.add(path)
    await discardUnboundUpload(path, rule)
    referencedPaths.clear()
    await discardUnboundUpload('handover-lots/lot-2/signed-doc/k.pdf', rule)
    await discardUnboundUpload(null, rule)
    referenceCheckFails = true
    await discardUnboundUpload(path, rule)
    expect(uploadTestState.removed).toEqual([])
  })
})

describe('verifyUploadedFiles — หลักฐานปิดงานหลายไฟล์', () => {
  const media = {
    photos: ['cases/c1/field_evidence/photo/k-p.jpg'],
    videos: ['cases/c1/field_evidence/video/k-v.mp4'],
    productPhotos: [],
    audioUrl: null,
  }

  it('ตรวจทุกไฟล์ตามช่องของมัน', async () => {
    putFakeUpload(media.photos[0] ?? '', sampleBytes('jpeg'))
    putFakeUpload(media.videos[0] ?? '', sampleBytes('mp4'))
    const map = await verifyUploadedFiles(fieldEvidenceFiles('c1', media))
    expect(Object.keys(map)).toEqual([...media.photos, ...media.videos])
    expect(map[media.videos[0] ?? '']?.mimeType).toBe('video/mp4')
  })

  it('ไฟล์ข้อความชื่อ .mp4 ในช่องวิดีโอ = UPLOAD_FILE_TYPE_INVALID (BUG-050)', async () => {
    putFakeUpload(media.photos[0] ?? '', sampleBytes('jpeg'))
    putFakeUpload(media.videos[0] ?? '', sampleBytes('text'))
    expect(await codeOf(() => verifyUploadedFiles(fieldEvidenceFiles('c1', media)))).toBe('UPLOAD_FILE_TYPE_INVALID')
  })

  it('รูปวางในช่องวิดีโอ (path ช่องอื่น) = UPLOAD_PATH_OUT_OF_SCOPE', async () => {
    const swapped = { ...media, videos: media.photos }
    putFakeUpload(media.photos[0] ?? '', sampleBytes('jpeg'))
    expect(await codeOf(() => verifyUploadedFiles(fieldEvidenceFiles('c1', swapped)))).toBe('UPLOAD_PATH_OUT_OF_SCOPE')
  })

  it('ไฟล์ที่ตรวจไว้แล้ว (known) ไม่ดาวน์โหลดซ้ำ แต่ยังต้องอยู่ใต้ prefix · map คืนเฉพาะไฟล์ที่ส่งมา', async () => {
    const known = {
      [media.photos[0] ?? '']: { sha256: 'a'.repeat(64), mimeType: 'image/jpeg', sizeBytes: 9 },
      'cases/c1/field_evidence/photo/old.jpg': { sha256: 'b'.repeat(64), mimeType: 'image/jpeg', sizeBytes: 9 },
    }
    putFakeUpload(media.videos[0] ?? '', sampleBytes('mp4'))
    const map = await verifyUploadedFiles(fieldEvidenceFiles('c1', media), known)
    expect(map[media.photos[0] ?? '']?.sha256).toBe('a'.repeat(64))
    expect(map).not.toHaveProperty('cases/c1/field_evidence/photo/old.jpg')
  })

  it('JSONB เก็บ/อ่านกลับได้ตรงกัน · ค่ารูปเพี้ยนถูกทิ้ง', () => {
    const map = { p: { sha256: 'a'.repeat(64), mimeType: 'image/png', sizeBytes: 3 } }
    expect(toVerifiedUploadMap(uploadMapJson(map))).toEqual(map)
    expect(toVerifiedUploadMap({ p: { sha256: 1 } })).toEqual({})
    expect(toVerifiedUploadMap(null)).toEqual({})
  })
})

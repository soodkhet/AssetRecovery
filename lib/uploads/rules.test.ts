import { describe, expect, it } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import { DOCUMENT_KINDS, IMAGE_KINDS, inspectUploadedBytes } from '@/lib/uploads/inspect'
import { caseDocumentRule } from '@/lib/uploads/rules'

/** กติกาไฟล์เอกสารเคสฝั่ง server — เอกสารชุด (สแกนรวมเล่ม) 25 MB · ไฟล์แยกประเภท 10 MB (มติ PO 04/10/2569) */

const MB = 1024 * 1024
const CASE_ID = '00000000-0000-4000-8000-00000000b0d1'

/** ไฟล์ PDF ขนาด `size` ไบต์ (magic bytes `%PDF-` ตามด้วยเนื้อว่าง) */
function pdfOf(size: number): Uint8Array {
  const buffer = new Uint8Array(size)
  buffer.set(new TextEncoder().encode('%PDF-1.7\n'))
  return buffer
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof ModuleError) return error.code
    throw error
  }
  return 'NO_ERROR'
}

describe('caseDocumentRule', () => {
  it('เอกสารชุด: prefix ของตัวเอง · PDF/รูป · เพดาน 25 MB', () => {
    const rule = caseDocumentRule(CASE_ID, 'bundle_doc')
    expect(rule.prefix).toBe(`cases/${CASE_ID}/bundle_doc/`)
    expect(rule.accept).toEqual(DOCUMENT_KINDS)
    expect(rule.maxBytes).toBe(25 * MB)
  })

  it('ช่องแยกประเภทยังคง 10 MB · รูปสินค้ารับรูปเท่านั้น', () => {
    expect(caseDocumentRule(CASE_ID, 'contract_doc').maxBytes).toBe(10 * MB)
    expect(caseDocumentRule(CASE_ID, 'national_id_doc').maxBytes).toBe(10 * MB)
    expect(caseDocumentRule(CASE_ID, 'product_photo').accept).toEqual(IMAGE_KINDS)
  })

  it('server ตรวจไฟล์ชุด 20 MB ผ่าน (magic bytes + SHA-256) แต่ไฟล์สัญญา 20 MB ถูกปัด · ชุดเกิน 25 MB ถูกปัด', () => {
    const big = pdfOf(20 * MB)
    const verified = inspectUploadedBytes(big, caseDocumentRule(CASE_ID, 'bundle_doc'))
    expect(verified.mimeType).toBe('application/pdf')
    expect(verified.sizeBytes).toBe(20 * MB)
    expect(verified.sha256).toMatch(/^[a-f0-9]{64}$/)

    expect(codeOf(() => inspectUploadedBytes(big, caseDocumentRule(CASE_ID, 'contract_doc')))).toBe(
      'UPLOAD_FILE_TOO_LARGE',
    )
    expect(codeOf(() => inspectUploadedBytes(pdfOf(25 * MB + 1), caseDocumentRule(CASE_ID, 'bundle_doc')))).toBe(
      'UPLOAD_FILE_TOO_LARGE',
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  acceptAttribute,
  BUNDLE_MAX_UPLOAD_BYTES,
  checkUploadCandidate,
  formSlotsFor,
  isAcceptedMime,
  MAX_UPLOAD_BYTES,
  maxUploadBytes,
  planDocumentModeSwitch,
  sanitizeFileName,
  sha256Hex,
  storagePath,
} from '@/lib/cases/document-upload'

/** `38` §6.3 · §6.3.1 — กติกาไฟล์แนบต่อ slot */

describe('isAcceptedMime', () => {
  it('slot เอกสารรับทั้ง PDF และรูป', () => {
    expect(isAcceptedMime('contract_doc', 'application/pdf')).toBe(true)
    expect(isAcceptedMime('national_id_doc', 'image/jpeg')).toBe(true)
    expect(isAcceptedMime('other_doc', 'application/pdf')).toBe(true)
  })

  it('รูปสินค้ารับเฉพาะรูป (ต้องทำ thumbnail grid ได้)', () => {
    expect(isAcceptedMime('product_photo', 'image/png')).toBe(true)
    expect(isAcceptedMime('product_photo', 'application/pdf')).toBe(false)
  })

  it('ปฏิเสธชนิดที่ไม่อยู่ในรายการ', () => {
    expect(isAcceptedMime('contract_doc', 'application/zip')).toBe(false)
    expect(isAcceptedMime('contract_doc', 'text/html')).toBe(false)
  })
})

describe('checkUploadCandidate', () => {
  it('ไฟล์ปกติผ่าน (คืน null)', () => {
    expect(checkUploadCandidate('contract_doc', { name: 'a.pdf', type: 'application/pdf', size: 1024 })).toBeNull()
  })

  it('ชนิดไม่รองรับ → ข้อความบอกชื่อไฟล์', () => {
    const message = checkUploadCandidate('product_photo', { name: 'x.pdf', type: 'application/pdf', size: 10 })
    expect(message).toContain('x.pdf')
  })

  it('ไฟล์ใหญ่เกินเพดาน / ไฟล์ว่าง ไม่ผ่าน', () => {
    expect(
      checkUploadCandidate('contract_doc', { name: 'big.pdf', type: 'application/pdf', size: 99_000_000 }),
    ).toContain('ใหญ่เกิน')
    expect(checkUploadCandidate('contract_doc', { name: 'e.pdf', type: 'application/pdf', size: 0 })).toContain(
      'ว่างเปล่า',
    )
  })
})

describe('sanitizeFileName / storagePath', () => {
  it('ตัดอักขระนอก ASCII ที่ทำ key เพี้ยน แต่คงนามสกุลไฟล์ไว้', () => {
    expect(sanitizeFileName('สัญญา เช่าซื้อ/2569.pdf')).toBe('2569.pdf')
    expect(sanitizeFileName('../../etc/passwd')).toBe('etc-passwd')
  })

  it('ชื่อที่เหลือแต่อักขระต้องห้าม กลายเป็น "file" + นามสกุลเดิม', () => {
    expect(sanitizeFileName('///')).toBe('file')
    expect(sanitizeFileName('รูปสินค้า.JPG')).toBe('file.jpg')
  })

  it('path แยกตามเคสและ slot', () => {
    expect(storagePath('case-1', 'product_photo', 'photo 1.jpg', 'abc')).toBe(
      'cases/case-1/product_photo/abc-photo-1.jpg',
    )
  })
})

describe('sha256Hex', () => {
  it('คืน hex 64 ตัวตรงกับค่าอ้างอิงของสตริงว่าง', async () => {
    const hash = await sha256Hex(new ArrayBuffer(0))
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('รูปแบบตรงกับที่ `caseDocumentUploadSchema` บังคับ (hex 64)', async () => {
    const hash = await sha256Hex(new TextEncoder().encode('assetrecovery').buffer as ArrayBuffer)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('acceptAttribute', () => {
  it('คืนรายการ mime คั่นด้วย comma สำหรับ <input accept>', () => {
    expect(acceptAttribute('product_photo').startsWith('image/')).toBe(true)
    expect(acceptAttribute('contract_doc')).toContain('application/pdf')
  })
})

describe('เอกสารชุดเดียว — ขนาด/ชนิด/การสลับโหมด (มติ PO 04/10/2569)', () => {
  const MB = 1024 * 1024

  it('เอกสารชุดรับ PDF/รูปเหมือนช่องเอกสาร เพดาน 25 MB · ไฟล์แยกประเภทคง 10 MB', () => {
    expect(BUNDLE_MAX_UPLOAD_BYTES).toBe(25 * MB)
    expect(maxUploadBytes('bundle_doc')).toBe(25 * MB)
    expect(maxUploadBytes('contract_doc')).toBe(MAX_UPLOAD_BYTES)
    expect(MAX_UPLOAD_BYTES).toBe(10 * MB)
    expect(isAcceptedMime('bundle_doc', 'application/pdf')).toBe(true)
    expect(isAcceptedMime('bundle_doc', 'image/jpeg')).toBe(true)
    expect(isAcceptedMime('bundle_doc', 'application/zip')).toBe(false)
  })

  it('ไฟล์ 20 MB ผ่านในช่องเอกสารชุด แต่ไม่ผ่านในช่องสัญญา · เกิน 25 MB ไม่ผ่าน', () => {
    const file = (size: number) => ({ name: 'scan.pdf', type: 'application/pdf', size })
    expect(checkUploadCandidate('bundle_doc', file(20 * MB))).toBeNull()
    expect(checkUploadCandidate('bundle_doc', file(25 * MB))).toBeNull()
    expect(checkUploadCandidate('contract_doc', file(20 * MB))).toContain('10 MB')
    expect(checkUploadCandidate('bundle_doc', file(25 * MB + 1))).toContain('25 MB')
  })

  it('ช่องในฟอร์มต่อโหมด — รูปสินค้าอยู่ section ของตัวเองทั้งสองโหมด', () => {
    expect(formSlotsFor('separate')).toEqual(['contract_doc', 'national_id_doc', 'other_doc'])
    expect(formSlotsFor('bundle')).toEqual(['bundle_doc', 'other_doc'])
  })

  it('สลับโหมด: ไม่มีไฟล์ค้าง = สลับได้ · ไฟล์ยังไม่อัปโหลด = ถามก่อน · ไฟล์อัปโหลดแล้ว = บล็อก', () => {
    expect(planDocumentModeSwitch('bundle', {}, ['product_photo', 'other_doc'])).toEqual({ kind: 'switch' })
    expect(planDocumentModeSwitch('bundle', {}, ['contract_doc', 'contract_doc', 'other_doc'])).toEqual({
      kind: 'confirm',
      dropCount: 2,
      slots: ['contract_doc'],
    })
    expect(planDocumentModeSwitch('separate', {}, ['bundle_doc'])).toEqual({
      kind: 'confirm',
      dropCount: 1,
      slots: ['bundle_doc'],
    })
    expect(planDocumentModeSwitch('bundle', { national_id_doc: 1 }, [])).toEqual({
      kind: 'blocked',
      slots: ['national_id_doc'],
    })
    expect(planDocumentModeSwitch('separate', { bundle_doc: 1 }, [])).toEqual({
      kind: 'blocked',
      slots: ['bundle_doc'],
    })
  })
})

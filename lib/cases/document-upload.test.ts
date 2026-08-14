import { describe, expect, it } from 'vitest'
import {
  acceptAttribute,
  checkUploadCandidate,
  isAcceptedMime,
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

import { describe, expect, it } from 'vitest'
import {
  LOT_DOCUMENT_LABEL,
  checkLotDocumentCandidate,
  documentExtension,
  lotDocumentMime,
  lotDocumentPath,
  lotDocumentSlots,
} from '@/lib/warehouse/lot-documents'

/** ยามของเอกสารแนบล็อต (`44` §6.3 · §6.4) — จำนวนช่องต้องตรงชนิดล็อตเสมอ */

describe('lotDocumentPath — path ตาม `44` §6.4', () => {
  it('ใบเซ็นรับ/หลักฐานจัดส่งใช้ชื่อไฟล์ตายตัว 1 ไฟล์ต่อชนิด', () => {
    expect(lotDocumentPath('lot-1', 'signed_doc', 'ใบเซ็นรับ.pdf')).toBe('handover-lots/lot-1/signed-doc.pdf')
    expect(lotDocumentPath('lot-1', 'delivery_proof', 'proof.JPG')).toBe('handover-lots/lot-1/delivery-proof.jpg')
  })

  it('ไฟล์ไม่มีนามสกุล/นามสกุลแปลก ถอยไปใช้ .pdf', () => {
    expect(documentExtension('scan')).toBe('pdf')
    expect(documentExtension('scan.verylongextension')).toBe('pdf')
    expect(lotDocumentPath('lot-2', 'signed_doc', 'scan')).toBe('handover-lots/lot-2/signed-doc.pdf')
  })
})

describe('lotDocumentMime — ใช้เลือกวิธีแสดงใน FileViewerModal', () => {
  it('pdf/รูปภาพ/อื่น ๆ', () => {
    expect(lotDocumentMime('handover-lots/l/signed-doc.pdf')).toBe('application/pdf')
    expect(lotDocumentMime('handover-lots/l/delivery-proof.jpg')).toBe('image/jpeg')
    expect(lotDocumentMime('handover-lots/l/delivery-proof.png')).toBe('image/png')
    expect(lotDocumentMime('handover-lots/l/delivery-proof.heic')).toBe('image/heic')
    expect(lotDocumentMime('handover-lots/l/delivery-proof.zip')).toBe('application/octet-stream')
  })
})

describe('checkLotDocumentCandidate — เตือนระดับฟอร์ม (ไม่ใช่ error code ของ `24`)', () => {
  it('ผ่านเมื่อเป็น PDF/รูปภาพขนาดปกติ', () => {
    expect(checkLotDocumentCandidate('signed_doc', { name: 'a.pdf', type: 'application/pdf', size: 1024 })).toBeNull()
    expect(checkLotDocumentCandidate('delivery_proof', { name: 'b.jpg', type: 'image/jpeg', size: 2048 })).toBeNull()
  })

  it('ปฏิเสธชนิดไฟล์อื่น ไฟล์ใหญ่เกิน และไฟล์ว่าง', () => {
    expect(checkLotDocumentCandidate('signed_doc', { name: 'a.zip', type: 'application/zip', size: 10 })).toContain(
      LOT_DOCUMENT_LABEL.signed_doc,
    )
    expect(
      checkLotDocumentCandidate('signed_doc', { name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }),
    ).toContain('ใหญ่เกิน')
    expect(checkLotDocumentCandidate('signed_doc', { name: 'a.pdf', type: 'application/pdf', size: 0 })).toContain(
      'ว่างเปล่า',
    )
  })
})

describe('lotDocumentSlots — จำนวนช่องตามชนิดล็อต (`44` §6.3)', () => {
  it('finance_pickup = 1 ช่อง · we_deliver = 2 ช่อง', () => {
    const pickup = lotDocumentSlots({ type: 'finance_pickup', status: 'pending_attach' })
    expect(pickup.map((slot) => slot.document)).toEqual(['signed_doc'])
    expect(pickup[0]?.label).toBe(LOT_DOCUMENT_LABEL.signed_doc)

    const deliver = lotDocumentSlots({ type: 'we_deliver', status: 'pending_delivery_proof' })
    expect(deliver.map((slot) => slot.document)).toEqual(['signed_doc', 'delivery_proof'])
  })

  it('แนบแล้ว = มี url · ช่องว่าง/สตริงว่างถือว่ายังไม่แนบ', () => {
    const slots = lotDocumentSlots({
      type: 'we_deliver',
      status: 'pending_delivery_proof',
      signedDocUrl: 'handover-lots/l/signed-doc.pdf',
      deliveryProofUrl: '   ',
    })
    expect(slots[0]).toMatchObject({ attached: true, fileUrl: 'handover-lots/l/signed-doc.pdf' })
    expect(slots[1]).toMatchObject({ attached: false, fileUrl: null })
  })

  it('ล็อต confirmed ถือว่าเอกสารครบเสมอ แม้การ์ดไม่มี url ให้ดู (§8.5)', () => {
    const slots = lotDocumentSlots({ type: 'we_deliver', status: 'confirmed' })
    expect(slots.every((slot) => slot.attached)).toBe(true)
    expect(slots.every((slot) => slot.fileUrl === null)).toBe(true)
  })
})

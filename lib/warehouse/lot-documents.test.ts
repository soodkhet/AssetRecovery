import { describe, expect, it } from 'vitest'
import {
  LOT_DOCUMENT_LABEL,
  checkLotDocumentCandidate,
  documentExtension,
  lotDocumentFileName,
  lotDocumentMime,
  lotDocumentPath,
  lotDocumentPrefix,
  lotDocumentSlots,
  lotPendingNotice,
} from '@/lib/warehouse/lot-documents'

/** ยามของเอกสารแนบล็อต (`44` §6.3 · §6.4) — จำนวนช่องต้องตรงชนิดล็อตเสมอ */

describe('lotDocumentPath — path ต่อเวอร์ชัน ไม่ทับของเดิม (`44` §6.4 · มติ PO 03/10/2569 UAT Q13)', () => {
  it('แต่ละชนิดอยู่โฟลเดอร์ของตัวเอง + ชื่อไฟล์ไม่ซ้ำต่อครั้งที่แนบ', () => {
    expect(lotDocumentPath('lot-1', 'signed_doc', 'ใบเซ็นรับ.pdf', 'k1')).toBe('handover-lots/lot-1/signed-doc/k1.pdf')
    expect(lotDocumentPath('lot-1', 'delivery_proof', 'proof.JPG', 'k2')).toBe('handover-lots/lot-1/delivery-proof/k2.jpg')
    expect(lotDocumentPath('lot-1', 'signed_doc', 'a.pdf', 'k1')).not.toBe(lotDocumentPath('lot-1', 'signed_doc', 'a.pdf', 'k3'))
    expect(lotDocumentPrefix('lot-1', 'signed_doc')).toBe('handover-lots/lot-1/signed-doc/')
  })

  it('ไฟล์ไม่มีนามสกุล/นามสกุลแปลก ถอยไปใช้ .pdf', () => {
    expect(documentExtension('scan')).toBe('pdf')
    expect(documentExtension('scan.verylongextension')).toBe('pdf')
    expect(lotDocumentPath('lot-2', 'signed_doc', 'scan', 'k')).toBe('handover-lots/lot-2/signed-doc/k.pdf')
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

describe('lotDocumentFileName — แสดงชื่อไฟล์แทน storage path ดิบ (BUG-151)', () => {
  const LOT = '11111111-2222-3333-4444-555555555555'
  const KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('path ต่อเวอร์ชัน {uuid}.{ext} → ชื่อชนิดเอกสาร + นามสกุลจริง', () => {
    expect(lotDocumentFileName('signed_doc', lotDocumentPath(LOT, 'signed_doc', 'scan.JPG', KEY))).toBe('signed-doc.jpg')
    expect(lotDocumentFileName('delivery_proof', `handover-lots/${LOT}/delivery-proof/${KEY}.pdf`)).toBe(
      'delivery-proof.pdf',
    )
  })

  it('path แบบ {uuid}-ชื่อเดิม → ส่วนท้ายหลัง uuid-', () => {
    expect(lotDocumentFileName('signed_doc', `handover-lots/${LOT}/${KEY}-ใบเซ็นรับ.pdf`)).toBe('ใบเซ็นรับ.pdf')
  })

  it('ไม่มี uuid นำหน้า → ส่วนท้ายของ path (ไม่มีโฟลเดอร์โผล่บนหน้าจอ)', () => {
    const name = lotDocumentFileName('signed_doc', `handover-lots/${LOT}/signed-doc.pdf`)
    expect(name).toBe('signed-doc.pdf')
    expect(name).not.toContain('/')
  })
})

describe('mytester2 E2-02 — แนบใบเซ็นรับแล้วแต่ยังไม่ยืนยัน', () => {
  it('การ์ด (ไม่มี url) ใช้ธงจาก server ⇒ "แนบแล้ว" ไม่ใช่ "รอแนบ"', () => {
    const slots = lotDocumentSlots({ type: 'finance_pickup', status: 'pending_attach', signedDocAttached: true })
    expect(slots[0]).toMatchObject({ attached: true, fileUrl: null })
    const proofMissing = lotDocumentSlots({
      type: 'we_deliver',
      status: 'pending_delivery_proof',
      signedDocAttached: true,
      deliveryProofAttached: false,
    })
    expect(proofMissing.map((slot) => slot.attached)).toEqual([true, false])
  })

  it('หน้ารายละเอียด: เอกสารครบ ⇒ รอยืนยัน · บอกเหตุที่นำเครื่องออกไม่ได้', () => {
    const lot = { type: 'finance_pickup', status: 'pending_attach', signedDocAttached: true, assetRemovalLocked: true } as const
    const notice = lotPendingNotice(lot, lotDocumentSlots(lot))
    expect(notice.pending).toContain('แนบเอกสารครบแล้ว รอยืนยันส่งมอบ')
    expect(notice.pending).not.toContain('ต้องแนบ')
    expect(notice.removalLocked).toContain('แนบใบส่งมอบที่มีลายเซ็นผู้รับแล้ว')
    expect(notice.removalLocked).toContain('นำเครื่องออกจากล็อตนี้ไม่ได้')
  })

  it('ยังไม่แนบ ⇒ บอกเฉพาะเอกสารที่ขาด · นำเครื่องออกได้ (ไม่มีข้อความล็อก)', () => {
    const lot = { type: 'finance_pickup', status: 'pending_attach', assetRemovalLocked: false } as const
    const notice = lotPendingNotice(lot, lotDocumentSlots(lot))
    expect(notice.pending).toContain(`ต้องแนบ${LOT_DOCUMENT_LABEL.signed_doc} แล้วยืนยัน`)
    expect(notice.removalLocked).toBeNull()
  })

  it('ส่งของแล้วรอหลักฐานจัดส่ง ⇒ ขาดเฉพาะหลักฐานจัดส่ง · เหตุล็อกตามใบเซ็นรับ', () => {
    const lot = {
      type: 'we_deliver',
      status: 'pending_delivery_proof',
      signedDocAttached: true,
      deliveryProofAttached: false,
      assetRemovalLocked: true,
    } as const
    const notice = lotPendingNotice(lot, lotDocumentSlots(lot))
    expect(notice.pending).toContain(`ต้องแนบ${LOT_DOCUMENT_LABEL.delivery_proof} แล้วยืนยัน`)
    expect(notice.pending).not.toContain(LOT_DOCUMENT_LABEL.signed_doc)
    expect(notice.removalLocked).not.toBeNull()
    expect(`${notice.pending}${notice.removalLocked}`).not.toMatch(/§|ไฟล์ \d/)
  })
})

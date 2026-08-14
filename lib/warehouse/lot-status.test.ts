import { describe, expect, it } from 'vitest'
import {
  assertLotConfirmDocuments,
  assertLotMutable,
  canConfirmLot,
  initialLotStatus,
  LOT_STATUSES,
  lotTab,
  missingLotDocuments,
  requiredLotDocuments,
  statusesInLotTab,
} from '@/lib/warehouse/lot-status'

/** `44` §6.3 · §9.2 · §9.3 · §10 — T07/T08/T09/T10/T14 ของ §17 */

describe('initialLotStatus (T07/T08)', () => {
  it('finance_pickup → pending_attach (ของยังอยู่ในคลัง รอไฟแนนซ์มารับ)', () => {
    expect(initialLotStatus('finance_pickup')).toBe('pending_attach')
  })

  it('we_deliver → pending_delivery_proof (ของออกจากคลังไปแล้ว)', () => {
    expect(initialLotStatus('we_deliver')).toBe('pending_delivery_proof')
  })
})

describe('lotTab (§9.3)', () => {
  it('finance_pickup ที่ยังไม่ยืนยัน อยู่แท็บ "รอส่งมอบ" (T07)', () => {
    expect(lotTab('pending_attach')).toBe('pending_handover')
  })

  it('we_deliver ที่รอหลักฐาน อยู่แท็บ "ส่งมอบแล้ว" ทันที (T08)', () => {
    expect(lotTab('pending_delivery_proof')).toBe('handed_over')
  })

  it('ยืนยันแล้ว อยู่แท็บ "ส่งมอบแล้ว"', () => {
    expect(lotTab('confirmed')).toBe('handed_over')
  })

  it('ทุกสถานะถูกจัดเข้าแท็บครบ ไม่มีล็อตหายจากหน้าจอ', () => {
    const covered = [...statusesInLotTab('pending_handover'), ...statusesInLotTab('handed_over')].sort()
    expect(covered).toEqual([...LOT_STATUSES].sort())
  })
})

describe('assertLotMutable (T14)', () => {
  it('ล็อตที่ยืนยันแล้วแตะไม่ได้ = LOT_ALREADY_CONFIRMED', () => {
    expect(() => assertLotMutable('confirmed')).toThrowError(/LOT_ALREADY_CONFIRMED/)
  })

  it('ล็อตที่ยังไม่ยืนยันแก้ได้ทั้งสองสถานะ', () => {
    expect(() => assertLotMutable('pending_attach')).not.toThrow()
    expect(() => assertLotMutable('pending_delivery_proof')).not.toThrow()
  })
})

describe('เอกสารที่ต้องแนบก่อนยืนยัน (§6.3)', () => {
  const none = { signedDocUrl: null, deliveryProofUrl: null }
  const signedOnly = { signedDocUrl: 'https://storage/signed.pdf', deliveryProofUrl: null }
  const both = { signedDocUrl: 'https://storage/signed.pdf', deliveryProofUrl: 'https://storage/proof.jpg' }

  it('finance_pickup ต้องมีใบเซ็นรับอย่างเดียว', () => {
    expect(requiredLotDocuments('finance_pickup')).toEqual(['signed_doc'])
    expect(canConfirmLot('finance_pickup', signedOnly)).toBe(true)
  })

  it('we_deliver ต้องมีทั้งใบเซ็นรับและหลักฐานจัดส่ง', () => {
    expect(requiredLotDocuments('we_deliver')).toEqual(['signed_doc', 'delivery_proof'])
    expect(canConfirmLot('we_deliver', signedOnly)).toBe(false)
    expect(canConfirmLot('we_deliver', both)).toBe(true)
  })

  it('T09 — ยืนยัน finance_pickup โดยไม่แนบใบเซ็น = LOT_MISSING_SIGNED_DOC', () => {
    expect(() => assertLotConfirmDocuments('finance_pickup', none)).toThrowError(/LOT_MISSING_SIGNED_DOC/)
  })

  it('we_deliver ที่มีแต่ใบเซ็น = LOT_MISSING_DELIVERY_PROOF', () => {
    expect(() => assertLotConfirmDocuments('we_deliver', signedOnly)).toThrowError(/LOT_MISSING_DELIVERY_PROOF/)
  })

  it('T10 — แนบครบตามชนิดแล้วผ่าน', () => {
    expect(() => assertLotConfirmDocuments('finance_pickup', signedOnly)).not.toThrow()
    expect(() => assertLotConfirmDocuments('we_deliver', both)).not.toThrow()
  })

  it('ขาดทั้งคู่ รายงานใบเซ็นรับก่อน (ลำดับการกรอกบนหน้าจอ)', () => {
    expect(missingLotDocuments('we_deliver', none)).toEqual(['signed_doc', 'delivery_proof'])
    expect(() => assertLotConfirmDocuments('we_deliver', none)).toThrowError(/LOT_MISSING_SIGNED_DOC/)
  })

  it('url ที่เป็นช่องว่างล้วนไม่นับว่าแนบแล้ว', () => {
    expect(canConfirmLot('finance_pickup', { signedDocUrl: '   ', deliveryProofUrl: null })).toBe(false)
  })
})

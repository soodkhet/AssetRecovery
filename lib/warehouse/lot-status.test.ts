import { describe, expect, it } from 'vitest'
import { WarehouseError } from '@/lib/warehouse/errors'
import {
  assertLotAssetRemovable,
  assertLotConfirmDocuments,
  assertLotDeletable,
  assertLotDeliveredAt,
  assertLotHasAssetsForDocument,
  assertLotMutable,
  canConfirmLot,
  EMPTY_LOT_BADGE_LABEL,
  isEmptyOpenLot,
  initialLotStatus,
  isLotAssetRemovalLocked,
  isLotConfirmedElsewhere,
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

describe('assertLotDeliveredAt (staging E-007)', () => {
  const now = new Date('2026-10-10T05:00:00Z')
  const lotCreatedAt = new Date('2026-10-09T03:00:00Z')
  const codeOf = (fn: () => void): string => {
    try {
      fn()
      return 'NO_ERROR'
    } catch (error) {
      return error instanceof WarehouseError ? error.code : 'OTHER'
    }
  }

  it('เวลาที่ผ่านมาแล้ว และหลังสร้างล็อต ⇒ ผ่าน · เผื่อนาฬิกาคลาด 5 นาที', () => {
    expect(codeOf(() => assertLotDeliveredAt(new Date('2026-10-10T04:00:00Z'), { now, lotCreatedAt }))).toBe('NO_ERROR')
    expect(codeOf(() => assertLotDeliveredAt(new Date('2026-10-10T05:04:00Z'), { now, lotCreatedAt }))).toBe('NO_ERROR')
  })
  it('อนาคตเกิน 5 นาที ⇒ LOT_DELIVERED_AT_IN_FUTURE', () => {
    expect(codeOf(() => assertLotDeliveredAt(new Date('2026-10-11T03:00:00Z'), { now, lotCreatedAt }))).toBe(
      'LOT_DELIVERED_AT_IN_FUTURE',
    )
  })
  it('ก่อนวันสร้างล็อต (เช่น ปีผิด) ⇒ LOT_DELIVERED_AT_BEFORE_LOT', () => {
    expect(codeOf(() => assertLotDeliveredAt(new Date('2025-10-09T03:00:00Z'), { now, lotCreatedAt }))).toBe(
      'LOT_DELIVERED_AT_BEFORE_LOT',
    )
  })
})

describe('isLotConfirmedElsewhere (mytester WH-03)', () => {
  it('LOT_ALREADY_CONFIRMED เท่านั้นที่ถือว่ามีคนยืนยันไปก่อน ⇒ ปิดหน้าต่าง + รีเฟรช', () => {
    expect(isLotConfirmedElsewhere('LOT_ALREADY_CONFIRMED')).toBe(true)
    expect(isLotConfirmedElsewhere('CONFIRM_TRANSACTION_FAILED')).toBe(false)
    expect(isLotConfirmedElsewhere(undefined)).toBe(false)
  })
})

describe('isLotAssetRemovalLocked / assertLotAssetRemovable (มติชั่วคราว M5 — รีวิวเฟส 4)', () => {
  const doc = 'https://storage.test/handover-lots/signed.pdf'

  it('pending_attach ที่ยังไม่แนบใบเซ็นรับ ⇒ นำเครื่องออกได้', () => {
    expect(isLotAssetRemovalLocked({ status: 'pending_attach', signedDocUrl: null })).toBe(false)
    expect(isLotAssetRemovalLocked({ status: 'pending_attach', signedDocUrl: '' })).toBe(false)
    expect(() => assertLotAssetRemovable({ status: 'pending_attach', signedDocUrl: null })).not.toThrow()
  })

  it('แนบใบเซ็นรับแล้ว ⇒ ล็อก · LOT_ALREADY_CONFIRMED พร้อมข้อความบอกเหตุ', () => {
    expect(isLotAssetRemovalLocked({ status: 'pending_attach', signedDocUrl: doc })).toBe(true)
    try {
      assertLotAssetRemovable({ status: 'pending_attach', signedDocUrl: doc })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(WarehouseError)
      expect((error as WarehouseError).code).toBe('LOT_ALREADY_CONFIRMED')
      expect((error as WarehouseError).message).toContain('ใบเซ็นรับ')
    }
  })

  it('pending_delivery_proof / confirmed ⇒ ล็อก', () => {
    expect(isLotAssetRemovalLocked({ status: 'pending_delivery_proof', signedDocUrl: null })).toBe(true)
    expect(isLotAssetRemovalLocked({ status: 'confirmed', signedDocUrl: doc })).toBe(true)
    expect(() => assertLotAssetRemovable({ status: 'pending_delivery_proof', signedDocUrl: null })).toThrow(WarehouseError)
  })
})

describe('ล็อตว่าง — isEmptyOpenLot / assertLotHasAssetsForDocument (ทดสอบซ้ำ local L-02)', () => {
  it('ยังไม่ยืนยัน + ไม่มีเครื่อง = ล็อตว่าง · ยืนยันแล้วหรือยังมีเครื่อง = ไม่ใช่', () => {
    expect(isEmptyOpenLot({ status: 'pending_attach', assetCount: 0 })).toBe(true)
    expect(isEmptyOpenLot({ status: 'pending_delivery_proof', assetCount: 0 })).toBe(true)
    expect(isEmptyOpenLot({ status: 'pending_attach', assetCount: 1 })).toBe(false)
    expect(isEmptyOpenLot({ status: 'confirmed', assetCount: 0 })).toBe(false)
    expect(EMPTY_LOT_BADGE_LABEL).toBe('ล็อตว่าง')
  })

  it('ใบส่งมอบของล็อตที่ไม่มีเครื่อง ⇒ EMPTY_LOT (ข้อความไม่มีเลขอ้างอิงสเปค)', () => {
    expect(() => assertLotHasAssetsForDocument({ id: 'lot-1', assetCount: 2 })).not.toThrow()
    try {
      assertLotHasAssetsForDocument({ id: 'lot-1', assetCount: 0 })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(WarehouseError)
      expect((error as WarehouseError).code).toBe('EMPTY_LOT')
      expect((error as WarehouseError).userMessage).not.toMatch(/§|`\d{2}`/)
    }
  })
})

describe('assertLotDeletable (known Q9 — ลบล็อตว่าง)', () => {
  it('ยังไม่ยืนยัน + ไม่มีเครื่อง ⇒ ลบได้ทั้งสองสถานะที่ยังไม่ยืนยัน', () => {
    expect(() => assertLotDeletable({ status: 'pending_attach', assetCount: 0 })).not.toThrow()
    expect(() => assertLotDeletable({ status: 'pending_delivery_proof', assetCount: 0 })).not.toThrow()
  })
  it('ยังมีเครื่อง ⇒ ASSET_ALREADY_IN_LOT พร้อมข้อความให้นำเครื่องออกก่อน', () => {
    expect(() => assertLotDeletable({ status: 'pending_attach', assetCount: 2 })).toThrow(
      expect.objectContaining({ code: 'ASSET_ALREADY_IN_LOT' }),
    )
  })
  it('ยืนยันแล้ว ⇒ LOT_ALREADY_CONFIRMED (แม้ไม่มีเครื่อง)', () => {
    expect(() => assertLotDeletable({ status: 'confirmed', assetCount: 0 })).toThrow(
      expect.objectContaining({ code: 'LOT_ALREADY_CONFIRMED' }),
    )
  })
})

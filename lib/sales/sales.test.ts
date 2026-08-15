import { describe, expect, it } from 'vitest'
import {
  assertCancellable,
  assertIssuable,
  assertNoNumberGap,
  assertTaxInvoiceFieldsComplete,
  buildTaxInvoiceDoc,
  invoiceDescriptionOf,
  missingTaxInvoiceFields,
  requireCancelReason,
  summarizeSalesAmounts,
  vatLabelOf,
  type TaxInvoiceDocSource,
  type TaxInvoiceFieldInput,
} from '@/lib/sales/sales'

/**
 * เทสต์กติกา pure ของไฟล์ 31 — §11 (error), §16 (test case) และฟิลด์บังคับตาม `28` §6.2
 * เงินเป็น satang ล้วน (Rule 01) · วันที่บนเอกสารเป็น พ.ศ. (Rule 01)
 */

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

const completeFields: TaxInvoiceFieldInput = {
  seller: { name: 'บริษัท แอสเซ็ทรีคัฟเวอรี่ จำกัด', taxId: '0105560000001', address: '99 ถนนพระราม 9 กรุงเทพฯ' },
  sellerVatRegistered: true,
  buyer: { name: 'บริษัท สยามไฟแนนซ์ จำกัด', taxId: '0105512420001', address: '1 ถนนสีลม กรุงเทพฯ' },
  description: invoiceDescriptionOf('มิถุนายน 2569'),
  amounts: { totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 },
}

describe('รวมยอดรายการขาย (`31` §6.1)', () => {
  it('รวม gross/vat/total ของทุกใบรายได้ในรอบ', () => {
    expect(
      summarizeSalesAmounts([
        { grossSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 },
        { grossSatang: 800_000, vatSatang: 56_000, totalSatang: 856_000 },
      ]),
    ).toEqual({ totalBeforeVatSatang: 2_000_000, vatSatang: 140_000, totalSatang: 2_140_000 })
  })

  it('รอบที่ยังไม่มีรายได้ = ศูนย์ทุกช่อง (ไม่พัง)', () => {
    expect(summarizeSalesAmounts([])).toEqual({ totalBeforeVatSatang: 0, vatSatang: 0, totalSatang: 0 })
  })

  it('ยอดต้นทางไม่สมดุล (total ≠ gross + vat) ⇒ โยนทันที ไม่ปล่อยผ่านไปขึ้นเอกสาร', () => {
    expect(() => summarizeSalesAmounts([{ grossSatang: 100, vatSatang: 7, totalSatang: 108 }])).toThrow(RangeError)
  })
})

describe('ฟิลด์บังคับตามกฎหมาย (`28` §6.2 · `31` §16)', () => {
  it('ครบทุกช่อง ⇒ ผ่าน', () => {
    expect(missingTaxInvoiceFields(completeFields)).toEqual([])
    expect(() => assertTaxInvoiceFieldsComplete(completeFields)).not.toThrow()
  })

  it('ไม่มี buyer_tax_id ⇒ TAX_INVOICE_FIELD_MISSING (เทสต์เคสของ `31` §16)', () => {
    const input = { ...completeFields, buyer: { ...completeFields.buyer, taxId: null } }
    expect(missingTaxInvoiceFields(input)).toEqual(['buyer_tax_id'])
    try {
      assertTaxInvoiceFieldsComplete(input)
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(codeOf(error)).toBe('TAX_INVOICE_FIELD_MISSING')
      expect((error as { context?: { missingFields?: string[] } }).context?.missingFields).toEqual(['buyer_tax_id'])
    }
  })

  it('เลขผู้เสียภาษีไม่ครบ 13 หลัก ⇒ ถือว่าขาด', () => {
    expect(missingTaxInvoiceFields({ ...completeFields, buyer: { ...completeFields.buyer, taxId: '01055124' } })).toEqual(
      ['buyer_tax_id'],
    )
  })

  it('ที่อยู่/ชื่อเป็นช่องว่างล้วน ⇒ ถือว่าขาด', () => {
    expect(
      missingTaxInvoiceFields({ ...completeFields, seller: { ...completeFields.seller, address: '   ' } }),
    ).toEqual(['seller_address'])
  })

  it('ผู้ขายยังไม่จด VAT ⇒ ออกใบกำกับภาษีเต็มรูปไม่ได้ (`31` §6.2)', () => {
    expect(missingTaxInvoiceFields({ ...completeFields, sellerVatRegistered: false })).toEqual([
      'seller_vat_registered',
    ])
  })

  it('ยอดก่อน VAT เป็นศูนย์ หรือ total ไม่ตรงกับ before + vat ⇒ ขาด', () => {
    expect(
      missingTaxInvoiceFields({
        ...completeFields,
        amounts: { totalBeforeVatSatang: 0, vatSatang: 0, totalSatang: 0 },
      }),
    ).toEqual(['amount_before_vat'])
    expect(
      missingTaxInvoiceFields({
        ...completeFields,
        amounts: { totalBeforeVatSatang: 1_000, vatSatang: 70, totalSatang: 1_080 },
      }),
    ).toEqual(['total_amount'])
  })
})

describe('State machine ใบกำกับภาษี (`31` §9.1 · `23` §6.10)', () => {
  it('รายการขายที่ยังไม่มีใบ active ⇒ ออกได้', () => {
    expect(() => assertIssuable(null)).not.toThrow()
  })

  it('มีใบ active อยู่แล้ว ⇒ TAX_INVOICE_ALREADY_ISSUED', () => {
    try {
      assertIssuable('INV-0005')
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(codeOf(error)).toBe('TAX_INVOICE_ALREADY_ISSUED')
    }
  })

  it('ยกเลิกใบที่ active ได้ · ใบที่ cancelled แล้วยกเลิกซ้ำไม่ได้ (terminal)', () => {
    expect(() => assertCancellable('active')).not.toThrow()
    try {
      assertCancellable('cancelled')
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(codeOf(error)).toBe('TAX_INVOICE_INVALID_STATUS')
    }
  })

  it('ยกเลิกโดยไม่ระบุเหตุผล ⇒ CANCEL_REQUIRES_REASON (เทสต์เคสของ `31` §16)', () => {
    for (const reason of [null, undefined, '', '   ']) {
      try {
        requireCancelReason(reason)
        expect.unreachable('ต้องโยน error')
      } catch (error) {
        expect(codeOf(error)).toBe('CANCEL_REQUIRES_REASON')
      }
    }
    expect(requireCancelReason('  ออกผิดบริษัท  ')).toBe('ออกผิดบริษัท')
  })

  it('เลขที่ต้องเป็นลำดับถัดไปพอดี ไม่งั้น INVOICE_NUMBER_GAP', () => {
    expect(() => assertNoNumberGap(1, 0)).not.toThrow()
    expect(() => assertNoNumberGap(6, 5)).not.toThrow()
    try {
      assertNoNumberGap(7, 5)
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(codeOf(error)).toBe('INVOICE_NUMBER_GAP')
    }
  })
})

describe('แบบข้อมูลเอกสาร PDF (`28` §6.2)', () => {
  const source: TaxInvoiceDocSource = {
    invoiceNumber: 'INV-0006',
    // 25/06/2026 = 25/06/2569 พ.ศ. (เวลาไทย)
    invoiceDate: new Date('2026-06-25T03:00:00Z'),
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    deliveryFormat: 'paper_pdf',
    seller: { ...completeFields.seller, name: 'บริษัท แอสเซ็ทรีคัฟเวอรี่ จำกัด', taxId: '0105560000001', address: '99 ถนนพระราม 9 กรุงเทพฯ', phone: '021234567' },
    buyer: { name: 'บริษัท สยามไฟแนนซ์ จำกัด', taxId: '0105512420001', address: '1 ถนนสีลม กรุงเทพฯ', phone: null },
    description: invoiceDescriptionOf('มิถุนายน 2569'),
    periodLabel: 'มิถุนายน 2569',
    amounts: { totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 },
    vatRatesPct: ['7.00'],
  }

  it('วันที่เป็น พ.ศ. · เงินคั่นหลักพัน · แยก VAT ออกจากมูลค่าบริการชัดเจน', () => {
    const doc = buildTaxInvoiceDoc(source)
    expect(doc.invoiceDateLabel).toBe('25/06/2569')
    expect(doc.amountBeforeVatText).toBe('12,000.00')
    expect(doc.vatLabel).toBe('ภาษีมูลค่าเพิ่ม 7%')
    expect(doc.vatText).toBe('840.00')
    expect(doc.totalText).toBe('12,840.00')
    expect(doc.totalInWordsText).toBe('หนึ่งหมื่นสองพันแปดร้อยสี่สิบบาทถ้วน')
    expect(doc.isCancelled).toBe(false)
    expect(doc.cancelNote).toBeNull()
    expect(doc.fileName).toBe('INV-0006.pdf')
  })

  it('ใบที่ยกเลิกแล้วต้องขึ้นข้อความยกเลิก + เหตุผลบนเอกสาร (ห้ามพิมพ์เหมือนใบใช้งาน)', () => {
    const doc = buildTaxInvoiceDoc({
      ...source,
      status: 'cancelled',
      cancelReason: 'ออกผิดบริษัท',
      cancelledAt: new Date('2026-06-28T03:00:00Z'),
    })
    expect(doc.isCancelled).toBe(true)
    expect(doc.statusLabel).toBe('ยกเลิก')
    expect(doc.cancelNote).toBe('ยกเลิกเมื่อ 28/06/2569 — ออกผิดบริษัท')
  })

  it('หลายอัตรา VAT ในรอบเดียว ⇒ ไม่ระบุ % บนหัวคอลัมน์', () => {
    expect(vatLabelOf(['7.00', '10.00'])).toBe('ภาษีมูลค่าเพิ่ม')
    expect(vatLabelOf([])).toBe('ภาษีมูลค่าเพิ่ม')
    expect(vatLabelOf(['10.00'])).toBe('ภาษีมูลค่าเพิ่ม 10%')
    expect(vatLabelOf(['6.50'])).toBe('ภาษีมูลค่าเพิ่ม 6.5%')
  })

  it('รายละเอียดบริการอ้างรอบเดือนตามตัวอย่างของ `31` §7.2', () => {
    expect(invoiceDescriptionOf(' มิถุนายน 2569 ')).toBe('ค่าบริการติดตามทรัพย์ รอบเดือน มิถุนายน 2569')
  })
})

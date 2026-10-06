import { describe, expect, it } from 'vitest'
import {
  BILLING_INVOICE_NOT_TAX_NOTE,
  billingCustomerWhtLines,
  billingInvoicePartiesOf,
  billingPartySnapshotOf,
  buildBillingInvoiceDoc,
} from '@/lib/revenue/billing-invoice'

/** ใบแจ้งหนี้/ใบวางบิล (มติ PO U95 · U96 #12) — ไม่ใช่เอกสารภาษี · VAT เป็นยอดประมาณการ */
describe('buildBillingInvoiceDoc', () => {
  const party = { name: 'บริษัท ก', taxId: '1234567890123', address: 'กรุงเทพฯ', phone: null, branchCode: '00000' }
  const doc = buildBillingInvoiceDoc({
    batchNumber: 'BL-2569-007',
    period: 'กันยายน 2569',
    sentAt: new Date('2026-10-01T03:00:00Z'),
    dueDate: new Date('2026-10-31T00:00:00Z'),
    seller: party,
    buyer: { ...party, name: 'ไฟแนนซ์ ข', branchCode: '00002' },
    sellerProfile: null,
    lines: [
      { caseRef: 'C-1', revenueDate: new Date('2026-09-10T00:00:00Z'), grossSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000, vatRatePct: '7.00' },
      { caseRef: 'C-2', revenueDate: new Date('2026-09-20T00:00:00Z'), grossSatang: 50_000, vatSatang: 3_500, totalSatang: 53_500, vatRatePct: '7.00' },
    ],
  })

  it('เลขเอกสาร = เลขรอบวางบิล · ยอดรวมจาก snapshot รายได้ · ข้อความ "ไม่ใช่ใบกำกับภาษี"', () => {
    expect(doc.title).toBe('ใบแจ้งหนี้ / ใบวางบิล')
    expect(doc.documentNumber).toBe('BL-2569-007')
    expect(doc.amounts).toEqual({ totalBeforeVatSatang: 150_000, vatSatang: 10_500, totalSatang: 160_500 })
    expect(doc.totalText).toBe('1,605.00')
    expect(doc.notTaxInvoiceNote).toBe(BILLING_INVOICE_NOT_TAX_NOTE)
    expect(doc.notTaxInvoiceNote).toContain('เอกสารนี้ไม่ใช่ใบกำกับภาษี')
    expect(doc.vatLabel).toBe('ภาษีมูลค่าเพิ่ม 7% (ประมาณการ ณ วันวางบิล)')
  })

  it('วันที่เป็น พ.ศ. · รายการเคสเรียงตามลำดับ · สาขาผู้ซื้อ', () => {
    expect(doc.issueDateLabel).toBe('01/10/2569')
    expect(doc.dueDateLabel).toBe('31/10/2569')
    expect(doc.lines.map((line) => [line.no, line.caseRef, line.beforeVatText])).toEqual([
      ['1', 'C-1', '1,000.00'],
      ['2', 'C-2', '500.00'],
    ])
    expect(doc.buyer.branchLabel).toBe('สาขาที่ 00002')
    expect(doc.fileName).toBe('BL-2569-007.pdf')
  })
})

describe('BUG-164 — snapshot คู่ค้าของใบแจ้งหนี้', () => {
  const seller = { name: 'ผู้ขาย', taxId: '0105500000001', address: 'กทม.', phone: '02-000', branchCode: '00000' }
  const buyer = { name: 'ไฟแนนซ์ ก', taxId: '0105500000002', address: null, phone: null, branchCode: '00003' }

  it('ทำ snapshot จากค่าปัจจุบัน — ที่อยู่ว่างเป็นสตริงว่าง', () => {
    expect(billingPartySnapshotOf(seller, buyer)).toEqual({
      sellerName: 'ผู้ขาย',
      sellerTaxId: '0105500000001',
      sellerAddress: 'กทม.',
      sellerPhone: '02-000',
      sellerBranchCode: '00000',
      buyerName: 'ไฟแนนซ์ ก',
      buyerTaxId: '0105500000002',
      buyerAddress: '',
      buyerPhone: null,
      buyerBranchCode: '00003',
    })
  })

  it('มี snapshot ⇒ ใช้ snapshot ไม่สนค่าปัจจุบันที่แก้ภายหลัง', () => {
    const snapshot = billingPartySnapshotOf(seller, buyer)
    const parties = billingInvoicePartiesOf(snapshot, {
      seller: { ...seller, name: 'ผู้ขาย (เปลี่ยนชื่อ)' },
      buyer: { ...buyer, name: 'ไฟแนนซ์ ก (เปลี่ยนชื่อ)', address: 'ที่อยู่ใหม่' },
    })
    expect(parties.seller.name).toBe('ผู้ขาย')
    expect(parties.buyer).toEqual({ name: 'ไฟแนนซ์ ก', taxId: '0105500000002', address: '', phone: null, branchCode: '00003' })
  })

  it('ไม่มี snapshot (แถวที่ไม่ผ่านการส่งรอบ) ⇒ ใช้ค่าปัจจุบัน', () => {
    const empty = {
      sellerName: null,
      sellerTaxId: null,
      sellerAddress: null,
      sellerPhone: null,
      sellerBranchCode: null,
      buyerName: null,
      buyerTaxId: null,
      buyerAddress: null,
      buyerPhone: null,
      buyerBranchCode: null,
    }
    expect(billingInvoicePartiesOf(empty, { seller, buyer }).buyer.name).toBe('ไฟแนนซ์ ก')
  })
})

describe('billingCustomerWhtLines — ภาษีที่ลูกค้าหักบนใบแจ้งหนี้ (BUG-165 · มติ PO U100)', () => {
  it('ยังไม่รับเงิน ⇒ ประมาณจากอัตราของบริษัท (ฐานก่อน VAT) + ยอดที่คาดว่าจะได้รับโอน', () => {
    expect(
      billingCustomerWhtLines({ amountBeforeVatSatang: 600_000, totalSatang: 642_000, recordedWhtSatang: 0, whtPct: 3 }),
    ).toEqual({
      whtLabel: 'หัก ภาษีเงินได้หัก ณ ที่จ่าย 3% ที่ลูกค้าจะหัก (ประมาณการ)',
      whtText: '(180.00)',
      expectedLabel: 'ยอดที่คาดว่าจะได้รับโอน',
      expectedText: '6,240.00',
    })
  })

  it('บันทึกยอดหักจริงแล้ว ⇒ ใช้ยอดจริง · บริษัทไม่หัก ⇒ null', () => {
    expect(
      billingCustomerWhtLines({ amountBeforeVatSatang: 600_000, totalSatang: 642_000, recordedWhtSatang: 17_500, whtPct: 3 }),
    ).toMatchObject({ whtText: '(175.00)', expectedLabel: 'ยอดรับสุทธิ', expectedText: '6,245.00' })
    expect(
      billingCustomerWhtLines({ amountBeforeVatSatang: 600_000, totalSatang: 642_000, recordedWhtSatang: 0, whtPct: null }),
    ).toBeNull()
  })

  it('เอกสาร: ไม่ส่งข้อมูลภาษีลูกค้า/บัญชี ⇒ ไม่มีแถว · ส่งบัญชี ⇒ ข้อความโอนเข้าบัญชี', () => {
    const line = {
      caseRef: 'C-1',
      revenueDate: new Date('2026-10-10T00:00:00Z'),
      grossSatang: 100_000,
      vatSatang: 7_000,
      totalSatang: 107_000,
      vatRatePct: '7.00',
    }
    const base = {
      batchNumber: 'BL-2569-001',
      period: 'ตุลาคม 2569',
      sentAt: new Date('2026-10-25T03:00:00Z'),
      dueDate: new Date('2026-11-24T00:00:00Z'),
      seller: { name: 'ก', taxId: '1', address: 'x', phone: null, branchCode: '00000' },
      buyer: { name: 'ข', taxId: '2', address: 'y', phone: null, branchCode: '00000' },
      sellerProfile: null,
      lines: [line],
    }
    const plain = buildBillingInvoiceDoc(base)
    expect(plain.customerWht).toBeNull()
    expect(plain.paymentChannelText).toBeNull()
    expect(plain.lines[0]?.detail).toBeNull()
    const full = buildBillingInvoiceDoc({
      ...base,
      lines: [{ ...line, assetDescription: 'OPPO A78', handoverDocRef: 'DLV-2569-007' }],
      customerWhtPct: 3,
      receivingAccount: { bankName: 'ธนาคารกสิกรไทย', accountNumber: '123-4-56789-0', accountName: null },
    })
    expect(full.lines[0]?.detail).toBe('OPPO A78 · ใบส่งมอบ DLV-2569-007')
    expect(full.paymentChannelText).toBe('โอนเข้าบัญชี ธนาคารกสิกรไทย · เลขที่บัญชี 123-4-56789-0')
    expect(full.customerWht?.whtText).toBe('(30.00)')
    expect(full.signers).toEqual(['ผู้วางบิล / ผู้ให้บริการ', 'ผู้รับวางบิล / ลูกค้า'])
  })
})

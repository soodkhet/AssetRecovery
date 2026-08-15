import { describe, expect, it } from 'vitest'
import { PayoutError } from '@/lib/payout/errors'
import {
  assertPayoutDocReady,
  assertVoucherReady,
  buildPaymentVoucherDocs,
  buildPayoutSummaryDoc,
  buildPayslipDocs,
  groupPayoutItemsByPayee,
  voucherNumber,
  type PayoutDocIssuer,
} from '@/lib/payout/payout-doc'
import type { PayoutBatchDetailDto, PayoutBatchItemDto } from '@/lib/payout/types'

const ISSUER: PayoutDocIssuer = {
  name: 'บริษัท ใจดี โมบาย จำกัด',
  address: '123 ถนนสุขุมวิท กรุงเทพฯ',
  taxId: '0105551234567',
  phone: '02-000-0000',
}

function item(overrides: Partial<PayoutBatchItemDto> = {}): PayoutBatchItemDto {
  return {
    id: 'item-1',
    source: 'expense',
    sourceId: 'exp-1',
    payeeId: 'payee-1',
    payeeName: 'ประยุทธ์ บุญมี',
    teamName: 'ทีมรับเหมาเหนือ',
    description: 'ค่าคอมมิชชั่น',
    caseRef: 'CT-0001',
    trackingRound: 1,
    grossSatang: 850_000,
    whtSatang: 25_500,
    netSatang: 824_500,
    taxProfileId: 'tax-1',
    taxProfileName: 'บุคคลธรรมดา 3%',
    whtPctSnapshot: 3,
    bankName: 'ธนาคารกสิกรไทย',
    accountNumberMasked: 'xxx-x-x1234-x',
    ...overrides,
  }
}

function batch(items: readonly PayoutBatchItemDto[], overrides: Partial<PayoutBatchDetailDto> = {}): PayoutBatchDetailDto {
  const gross = items.reduce((total, row) => total + row.grossSatang, 0)
  const wht = items.reduce((total, row) => total + row.whtSatang, 0)
  return {
    id: '0f8f3d1e-1111-2222-3333-444455556666',
    name: 'รอบจ่าย Outsource ตัดรอบ 30/06/2569',
    side: 'outsource',
    status: 'file_generated',
    grossSatang: gross,
    whtSatang: wht,
    netSatang: gross - wht,
    itemCount: items.length,
    bankAccountId: 'acc-1',
    bankAccountLabel: 'ธนาคารกสิกรไทย xxx-x-x9876-x',
    idempotencyKey: 'PB-OUT-25690705-ABCDEF',
    paymentFileUrl: 'payout-batches/x/PB-OUT-25690705-ABCDEF-v1.csv',
    // 05/07/2569 07:00 ICT
    paymentFileGeneratedAt: '2026-07-05T00:00:00.000Z',
    createdAt: '2026-06-30T02:00:00.000Z',
    createdByName: 'การเงิน ทดสอบ',
    updatedAt: '2026-07-05T00:00:00.000Z',
    items,
    ...overrides,
  }
}

describe('groupPayoutItemsByPayee (`28` §6.1 — 1 คน = 1 ใบต่อรอบ)', () => {
  it('รวมรายการของคนเดียวกันเป็นกลุ่มเดียว และรวมยอดด้วยสูตรของ `22` §6.10', () => {
    const groups = groupPayoutItemsByPayee([
      item(),
      item({ id: 'item-2', sourceId: 'exp-2', description: 'ค่าน้ำมัน', grossSatang: 93_000, whtSatang: 2_790, netSatang: 90_210 }),
      item({ id: 'item-3', payeeId: 'payee-2', payeeName: 'สมหญิง ดูแลดี', grossSatang: 410_000, whtSatang: 12_300, netSatang: 397_700 }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]!.payeeName).toBe('ประยุทธ์ บุญมี')
    expect(groups[0]!.totals).toEqual({ grossSatang: 943_000, whtSatang: 28_290, netSatang: 914_710, itemCount: 2 })
    expect(groups[0]!.whtPctSnapshot).toBe(3)
    expect(groups[1]!.totals.netSatang).toBe(397_700)
  })

  it('อัตรา WHT ไม่เท่ากันทุกรายการ = ไม่สรุปอัตราเดียวบนเอกสาร', () => {
    const groups = groupPayoutItemsByPayee([
      item(),
      item({ id: 'item-2', sourceId: 'adv-1', source: 'advance', whtPctSnapshot: null, whtSatang: 0, netSatang: 850_000 }),
    ])
    expect(groups[0]!.whtPctSnapshot).toBeNull()
  })

  it('รายการที่ net ≠ gross − wht ล้มทันที (ยามของ `22` §6.10 ก่อนเงินออกจริง)', () => {
    expect(() => groupPayoutItemsByPayee([item({ netSatang: 999_999 })])).toThrow(RangeError)
  })
})

describe('ยามสถานะของเอกสาร (`17` §7.1 · `13` §6.7)', () => {
  it('รอบที่ยัง draft ออกเอกสารไม่ได้ (ยังรวบรวมรายการไม่ครบ)', () => {
    expect(() => assertPayoutDocReady('draft')).toThrow(PayoutError)
    expect(() => assertPayoutDocReady('checking')).not.toThrow()
  })

  it('ใบสำคัญจ่ายออกได้ตั้งแต่สร้างไฟล์โอนแล้วเท่านั้น', () => {
    expect(() => assertVoucherReady('checking')).toThrow(PayoutError)
    expect(() => assertVoucherReady('file_generated')).not.toThrow()
    expect(() => assertVoucherReady('completed')).not.toThrow()
  })
})

describe('buildPayoutSummaryDoc (`04_payout_batch_summary.pdf`)', () => {
  const doc = buildPayoutSummaryDoc(
    batch([
      item(),
      item({ id: 'item-2', payeeId: 'payee-2', payeeName: 'ประสิทธิ์ มากมี', teamName: null, grossSatang: 620_000, whtSatang: 18_600, netSatang: 601_400 }),
    ]),
    ISSUER,
  )

  it('หัวเอกสาร: ฝั่ง/สถานะ/วันที่เป็น พ.ศ. และมี idempotency key ของไฟล์โอน', () => {
    expect(doc.title).toBe('สรุปรอบจ่ายเงิน')
    expect(doc.sideLabel).toBe('Outsource')
    expect(doc.statusLabel).toBe('สร้างไฟล์โอนแล้ว')
    expect(doc.issuedAtLabel).toBe('05/07/2569')
    expect(doc.idempotencyKey).toBe('PB-OUT-25690705-ABCDEF')
  })

  it('ตาราง 1 แถวต่อผู้รับเงิน + แถวรวมตรงกับยอดของรอบ', () => {
    expect(doc.rows.map((row) => [row.no, row.payeeName, row.grossText, row.whtText, row.netText])).toEqual([
      [1, 'ประยุทธ์ บุญมี', '8,500.00', '255.00', '8,245.00'],
      [2, 'ประสิทธิ์ มากมี', '6,200.00', '186.00', '6,014.00'],
    ])
    expect(doc.totalGrossText).toBe('14,700.00')
    expect(doc.totalWhtText).toBe('441.00')
    expect(doc.totalNetText).toBe('14,259.00')
    expect(doc.itemCountText).toBe('2 รายการ')
  })

  it('รอบที่ยังไม่สร้างไฟล์โอน บอกสถานะไฟล์ตรง ๆ ไม่แสดงวันที่ปลอม', () => {
    const pending = buildPayoutSummaryDoc(
      batch([item()], { status: 'checking', paymentFileGeneratedAt: null, idempotencyKey: null, bankAccountLabel: null }),
      ISSUER,
    )
    expect(pending.paymentFileLabel).toBe('ยังไม่ได้สร้างไฟล์โอน')
    expect(pending.issuedAtLabel).toBe('30/06/2569')
    expect(pending.idempotencyKey).toBe('—')
    expect(pending.bankAccountLabel).toBe('—')
  })
})

describe('buildPaymentVoucherDocs (`05_payment_voucher.pdf`)', () => {
  it('1 ใบต่อผู้รับเงิน พร้อมยอดสุทธิเป็นตัวอักษรตามตัวอย่าง', () => {
    const voucher = buildPaymentVoucherDocs(batch([item()]), ISSUER)[0]!
    expect(voucher.voucherNo).toBe('PV-2569-PB-OUT-25690705-ABCDEF-001')
    expect(voucher.payeeName).toBe('ประยุทธ์ บุญมี')
    expect(voucher.bankLine).toBe('ธนาคารกสิกรไทย เลขที่บัญชี xxx-x-x1234-x')
    expect(voucher.payDateLabel).toBe('05/07/2569')
    expect(voucher.grossText).toBe('8,500.00')
    expect(voucher.whtText).toBe('255.00')
    expect(voucher.netText).toBe('8,245.00')
    expect(voucher.netInWords).toBe('แปดพันสองร้อยสี่สิบห้าบาทถ้วน')
  })

  it('รอบที่ยังไม่ยืนยันจ่าย มีข้อความกำกับ · รอบที่ completed ไม่มี', () => {
    const pending = buildPaymentVoucherDocs(batch([item()]), ISSUER)[0]!
    expect(pending.pendingNote).not.toBeNull()

    const done = buildPaymentVoucherDocs(batch([item()], { status: 'completed' }), ISSUER)[0]!
    expect(done.pendingNote).toBeNull()
  })

  it('เลขที่ใบสำคัญจ่าย deterministic — พิมพ์ซ้ำได้เลขเดิม', () => {
    expect(voucherNumber({ batchRef: 'ABCD1234', beYear: 2569, index: 12 })).toBe('PV-2569-ABCD1234-012')
  })
})

/** สลิปใบแรกของรอบ (คนแรกในรอบ) — ทุกเคสในชุดนี้มีผู้รับเงินคนเดียว */
function firstPayslip(...args: Parameters<typeof buildPayslipDocs>) {
  const [slip] = buildPayslipDocs(...args)
  if (slip === undefined) throw new Error('ไม่มีสลิปให้ตรวจ')
  return slip
}

describe('buildPayslipDocs (`06_payslip.pdf`)', () => {
  it('บรรทัดรายการ + ยอดหักในวงเล็บ + อัตรา WHT เมื่อทุกรายการอัตราเดียวกัน', () => {
    const slip = firstPayslip(
      batch([
        item(),
        item({ id: 'item-2', sourceId: 'exp-2', description: 'ค่าน้ำมัน', caseRef: 'CT-0002', trackingRound: 2, grossSatang: 93_000, whtSatang: 2_790, netSatang: 90_210 }),
      ]),
      ISSUER,
    )

    expect(slip.rows).toEqual([
      { description: 'ค่าคอมมิชชั่น — เคส CT-0001', amountText: '8,500.00' },
      { description: 'ค่าน้ำมัน — เคส CT-0002 (รอบติดตามที่ 2)', amountText: '930.00' },
    ])
    expect(slip.grossText).toBe('9,430.00')
    expect(slip.whtLabel).toBe('หักภาษี ณ ที่จ่าย (3.00%)')
    expect(slip.whtText).toBe('(282.90)')
    expect(slip.netText).toBe('9,147.10')
  })

  it('เงินทดรองจ่ายกำกับว่าไม่หัก WHT (ไม่ใช่เงินได้ — มติ 3.4)', () => {
    const slip = firstPayslip(
      batch([
        item({ source: 'advance', sourceId: 'adv-1', description: 'ค่าเดินทางล่วงหน้า', caseRef: null, whtPctSnapshot: null, whtSatang: 0, netSatang: 850_000 }),
      ]),
      ISSUER,
    )
    expect(slip.rows[0]!.description).toBe('ค่าเดินทางล่วงหน้า (เงินทดรองจ่าย — ไม่หักภาษี ณ ที่จ่าย)')
    expect(slip.whtLabel).toBe('หักภาษี ณ ที่จ่าย')
    expect(slip.whtText).toBe('0.00')
  })
})

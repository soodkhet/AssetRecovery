import { describe, expect, it } from 'vitest'
import { sumPayoutTaxSplit } from '@/lib/finance/wht-calc'
import { PayoutError } from '@/lib/payout/errors'
import {
  assertPayoutDocReady,
  assertVoucherReady,
  buildPaymentVoucherDocs,
  buildPayoutSummaryDoc,
  buildPayslipDocs,
  groupPayoutItemsByPayee,
  payslipStatsOf,
  voucherNumberOf,
  type PayoutDocIssuer,
  type PayoutPayeeDocInfo,
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
    whtBaseIncluded: true,
    whtIncomeCategory: 'sec_40_8',
    whtCondition: 'withhold',
    advanceOffsetSatang: 0,
    transferSatang: 824_500,
    advanceOffsets: [],
    voucherNumber: 'PV-2569-0007',
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
    advanceOffsetSatang: 0,
    transferSatang: gross - wht,
    ...sumPayoutTaxSplit(items),
    itemCount: items.length,
    bankAccountId: 'acc-1',
    bankAccountLabel: 'ธนาคารกสิกรไทย xxx-x-x9876-x',
    idempotencyKey: 'PB-OUT-25690705-ABCDEF',
    paymentFileUrl: 'payout-batches/x/PB-OUT-25690705-ABCDEF-v1.csv',
    // 05/07/2569 07:00 ICT
    paymentFileGeneratedAt: '2026-07-05T00:00:00.000Z',
    whtPolicy: null,
    createdAt: '2026-06-30T02:00:00.000Z',
    createdByName: 'การเงิน ทดสอบ',
    updatedAt: '2026-07-05T00:00:00.000Z',
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
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
    // มติ PO U67 — รอบที่ยกเลิกไม่มีการจ่ายจริง ห้ามออกเอกสารทุกใบ
    expect(() => assertPayoutDocReady('cancelled')).toThrow(PayoutError)
    expect(() => assertVoucherReady('cancelled')).toThrow(PayoutError)
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
    expect(voucher.voucherNo).toBe('PV-2569-0007')
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

  it('มติ PO U102 — เลขที่ใบสำคัญจ่ายมาจาก snapshot ของรายการ (พิมพ์ซ้ำได้เลขเดิม) · ยังไม่มีเลข = ขีด', () => {
    expect(voucherNumberOf([item({ voucherNumber: null }), item({ voucherNumber: 'PV-2569-0012' })])).toBe('PV-2569-0012')
    expect(voucherNumberOf([item({ voucherNumber: null })])).toBeNull()
    const unnumbered = buildPaymentVoucherDocs(batch([item({ voucherNumber: null })]), ISSUER)[0]!
    expect(unnumbered.voucherNo).toBe('—')
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
    expect(slip.whtLabel).toBe('หักภาษี ณ ที่จ่าย (3%)')
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

describe('มติ PO U30 — บรรทัด "หักคืนเงินทดรอง ADV-xxx" บนเอกสาร (หักหลังภาษี)', () => {
  const ADV = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
  const offsetItem = item({
    advanceOffsetSatang: 55_000,
    transferSatang: 769_500,
    advanceOffsets: [{ advanceId: ADV, advanceRef: 'ADV-3FA85F64', amountSatang: 55_000 }],
  })

  it('สรุปรอบ: ยอดโอน = สุทธิ − หัก · ยอดก่อนหัก/WHT/สุทธิไม่เปลี่ยน', () => {
    const doc = buildPayoutSummaryDoc(batch([offsetItem]), ISSUER)
    expect(doc.rows[0]?.netText).toBe('8,245.00')
    expect(doc.rows[0]?.offsetText).toBe('550.00')
    expect(doc.rows[0]?.transferText).toBe('7,695.00')
    expect(doc.totalWhtText).toBe('255.00')
    expect(doc.totalTransferText).toBe('7,695.00')
    expect(doc.totalOffsetText).toBe('550.00')
  })

  it('ใบสำคัญจ่าย: มีบรรทัดหักคืน + จ่ายจริง = ยอดโอน', () => {
    const [voucher] = buildPaymentVoucherDocs(batch([offsetItem]), ISSUER)
    expect(voucher?.netAfterWhtText).toBe('8,245.00')
    expect(voucher?.offsetLines).toEqual([{ label: 'หักคืนเงินทดรอง ADV-3FA85F64', amountText: '(550.00)' }])
    expect(voucher?.netText).toBe('7,695.00')
    expect(voucher?.whtText).toBe('255.00')
  })

  it('สลิป: บรรทัดหักคืนหลังบรรทัดภาษี · ยอดโอนสุทธิลดลง', () => {
    const [slip] = buildPayslipDocs(batch([offsetItem]), ISSUER)
    expect(slip?.offsetLines).toEqual([{ label: 'หักคืนเงินทดรอง ADV-3FA85F64', amountText: '(550.00)' }])
    expect(slip?.netText).toBe('7,695.00')
  })

  it('ไม่มีการหัก ⇒ ไม่มีบรรทัดหัก และยอดโอน = สุทธิ', () => {
    const doc = buildPayoutSummaryDoc(batch([item()]), ISSUER)
    expect(doc.totalOffsetText).toBeNull()
    expect(doc.totalTransferText).toBe(doc.totalNetText)
    expect(buildPayslipDocs(batch([item()]), ISSUER)[0]?.offsetLines).toEqual([])
  })
})

describe('มติ PO U100/U101 — ข้อมูลผู้รับ · รายการรวมตามประเภท · WHT ตามฐานจริง · สถิติสลิป', () => {
  const commission = item({ id: 'c1', sourceId: 'e1', grossSatang: 480_000, whtSatang: 14_400, netSatang: 465_600, transferSatang: 465_600 })
  const commission2 = item({ id: 'c2', sourceId: 'e2', caseRef: 'CT-0002', grossSatang: 20_000, whtSatang: 600, netSatang: 19_400, transferSatang: 19_400 })
  const hotel = item({
    id: 'h1',
    sourceId: 'e3',
    description: 'ค่าที่พัก',
    caseRef: null,
    grossSatang: 120_000,
    whtSatang: 0,
    netSatang: 120_000,
    transferSatang: 120_000,
    whtBaseIncluded: false,
  })
  const info: PayoutPayeeDocInfo = {
    displayName: 'นายประยุทธ์ บุญมี',
    taxId: '1103700000992',
    isCorporate: false,
    address: '1 ถ.ทดสอบ',
    branchLabel: null,
    stats: { successCases: 2, fieldDays: 3, hotelNights: 2 },
  }

  it('ใบสำคัญจ่าย — รวมตามประเภท + แยกรายการนอกฐาน · ป้าย WHT ระบุฐานที่ระบบคิดจริง (ยอดหักจาก snapshot)', () => {
    const [voucher] = buildPaymentVoucherDocs(batch([commission, commission2, hotel]), ISSUER, new Map([['payee-1', info]]))
    expect(voucher?.payee.displayName).toBe('นายประยุทธ์ บุญมี')
    expect(voucher?.lines).toEqual([
      { description: 'ค่าคอมมิชชั่น', detail: '2 รายการ', amountText: '5,000.00' },
      { description: 'ค่าที่พัก', detail: '1 รายการ · ไม่อยู่ในฐานภาษีหัก ณ ที่จ่าย', amountText: '1,200.00' },
    ])
    expect(voucher?.whtLabel).toBe('หัก ภาษี ณ ที่จ่าย 3% (ฐานภาษี 5,000.00)')
    expect(voucher?.whtDeductText).toBe('(150.00)')
    expect(voucher?.signers).toEqual(['ผู้จัดทำ', 'ผู้อนุมัติ', 'ผู้รับเงิน'])
  })

  it('ใบสำคัญจ่าย — ทุกรายการอยู่ในฐาน ⇒ ไม่ต้องพิมพ์ฐาน · ไม่มีข้อมูลผู้รับ ⇒ ใช้ชื่อจากรายการ', () => {
    const [voucher] = buildPaymentVoucherDocs(batch([commission]), ISSUER)
    expect(voucher?.whtLabel).toBe('หัก ภาษี ณ ที่จ่าย 3%')
    expect(voucher?.payee.displayName).toBe('ประยุทธ์ บุญมี')
    expect(voucher?.payee.address).toBeNull()
  })

  it('สลิป — ช่องสรุปเคส/วันทำงาน/คืนที่พัก/ยอดโอน + เลขที่ใบสำคัญจ่ายเดียวกัน', () => {
    const payees = new Map([['payee-1', info]])
    const [slip] = buildPayslipDocs(batch([commission, hotel]), ISSUER, payees)
    const [voucher] = buildPaymentVoucherDocs(batch([commission, hotel]), ISSUER, payees)
    expect(slip?.payeeName).toBe('นายประยุทธ์ บุญมี')
    expect(slip?.stats).toEqual([
      { label: 'เคสสำเร็จ', value: '2 เคส' },
      { label: 'วันทำงานภาคสนาม', value: '3 วัน' },
      { label: 'คืนที่พัก', value: '2 คืน' },
      { label: 'ยอดโอนสุทธิ', value: '5,856.00 บาท' },
    ])
    expect(slip?.voucherNo).toBe(voucher?.voucherNo)
    expect(slip?.note).toContain('เอกสารนี้ออกโดยระบบ')
  })

  it('payslipStatsOf — เคสสำเร็จนับเคสไม่ซ้ำของค่าคอมมิชชัน · วันทำงาน = วันไม่ซ้ำของแถวรายวัน · คืนที่พักรวมจำนวนคืน', () => {
    const day = (d: number): Date => new Date(Date.UTC(2026, 9, d))
    expect(
      payslipStatsOf([
        { expenseType: 'commission', caseId: 'a', fieldDaySettlementId: null, expenseDate: day(1), hotelNights: 1 },
        { expenseType: 'commission', caseId: 'a', fieldDaySettlementId: null, expenseDate: day(1), hotelNights: 1 },
        { expenseType: 'commission', caseId: 'b', fieldDaySettlementId: null, expenseDate: day(2), hotelNights: 1 },
        { expenseType: 'no_success_fee', caseId: 'c', fieldDaySettlementId: null, expenseDate: day(2), hotelNights: 1 },
        { expenseType: 'fuel', caseId: null, fieldDaySettlementId: 's1', expenseDate: day(3), hotelNights: 1 },
        { expenseType: 'allowance', caseId: null, fieldDaySettlementId: 's1', expenseDate: day(3), hotelNights: 1 },
        { expenseType: 'allowance', caseId: null, fieldDaySettlementId: 's2', expenseDate: day(4), hotelNights: 1 },
        { expenseType: 'hotel', caseId: null, fieldDaySettlementId: null, expenseDate: day(4), hotelNights: 2 },
        { expenseType: 'hotel', caseId: null, fieldDaySettlementId: null, expenseDate: day(5), hotelNights: 1 },
      ]),
    ).toEqual({ successCases: 2, fieldDays: 2, hotelNights: 3 })
    expect(payslipStatsOf([])).toEqual({ successCases: 0, fieldDays: 0, hotelNights: 0 })
  })

  it('สรุปรอบจ่าย — จำนวนผู้รับ · วันเวลาที่พิมพ์ (พ.ศ.) · หักคืนเงินทดรองในตาราง', () => {
    const doc = buildPayoutSummaryDoc(batch([commission, hotel]), ISSUER, new Date('2026-10-31T09:45:00Z'))
    expect(doc.payeeCountText).toBe('1 ราย')
    expect(doc.printedAtLabel).toBe('31/10/2569 16:45')
    expect(doc.rows[0]?.offsetCellText).toBe('0.00')
    expect(doc.totalOffsetCellText).toBe('0.00')
  })
})

describe('มติ PO U105 — ผู้จ่ายออกภาษีให้: ใบสำคัญจ่าย/สลิปแยกบรรทัด "ภาษีที่บริษัทออกให้" ไม่หักจากผู้รับ', () => {
  // snapshot ของรอบ: เงินได้ 10,000 อัตรา 3% แบบ (2) ⇒ gross 10,309.28 · wht 309.28 · net 10,000
  const grossedUp = item({
    grossSatang: 1_030_928,
    whtSatang: 30_928,
    netSatang: 1_000_000,
    transferSatang: 1_000_000,
    whtPctSnapshot: 3,
    whtCondition: 'pay_always',
  })

  it('ใบสำคัญจ่าย: ค่าตอบแทน 10,000 · หักภาษี 0 · บรรทัดภาษีที่บริษัทออกให้ 309.28 · ยอดโอน 10,000', () => {
    const voucher = buildPaymentVoucherDocs(batch([grossedUp]), ISSUER)[0]!
    expect(voucher.grossText).toBe('10,000.00')
    expect(voucher.lines.map((line) => line.amountText)).toEqual(['10,000.00'])
    expect(voucher.whtDeductText).toBe('0.00')
    expect(voucher.payerTaxLine).toEqual({ label: 'ภาษีที่บริษัทออกให้ 3% (ไม่หักจากผู้รับ)', amountText: '309.28' })
    expect(voucher.netText).toBe('10,000.00')
  })

  it('สลิป: แถว = ค่าตอบแทน · ภาษีที่หัก 0 · มีบรรทัดภาษีที่บริษัทออกให้', () => {
    const slip = buildPayslipDocs(batch([grossedUp]), ISSUER)[0]!
    expect(slip.rows.map((row) => row.amountText)).toEqual(['10,000.00'])
    expect(slip.grossText).toBe('10,000.00')
    expect(slip.whtText).toBe('0.00')
    expect(slip.payerTaxLine?.amountText).toBe('309.28')
    expect(slip.netText).toBe('10,000.00')
  })

  it('หัก ณ ที่จ่ายตามปกติ ⇒ ไม่มีบรรทัดภาษีที่บริษัทออกให้ (เอกสารเดิมไม่เปลี่ยน)', () => {
    const voucher = buildPaymentVoucherDocs(batch([item()]), ISSUER)[0]!
    expect(voucher.payerTaxLine).toBeNull()
    expect(buildPayslipDocs(batch([item()]), ISSUER)[0]!.payerTaxLine).toBeNull()
  })
})

describe('มติ PO U109 — สรุปรอบจ่ายแยก "ค่าตอบแทน" กับ "ภาษีที่บริษัทออกให้"', () => {
  // เงินได้ ฿10,000 อัตรา 3% คนละเงื่อนไข: (1) หัก 300 · (2) ออกให้ 309.28 · (3) ออกให้ 300
  const mixed = [
    item({ id: 'w1', payeeId: 'p1', payeeName: 'หนึ่ง หักปกติ', grossSatang: 1_000_000, whtSatang: 30_000, netSatang: 970_000, transferSatang: 970_000, whtCondition: 'withhold' }),
    item({ id: 'w2', payeeId: 'p2', payeeName: 'สอง ออกให้ตลอดไป', grossSatang: 1_030_928, whtSatang: 30_928, netSatang: 1_000_000, transferSatang: 1_000_000, whtCondition: 'pay_always' }),
    item({ id: 'w3', payeeId: 'p3', payeeName: 'สาม ออกให้ครั้งเดียว', grossSatang: 1_030_000, whtSatang: 30_000, netSatang: 1_000_000, transferSatang: 1_000_000, whtCondition: 'pay_once' }),
  ]
  const doc = buildPayoutSummaryDoc(batch(mixed), ISSUER)

  it('ต่อผู้รับ: (2) ค่าตอบแทน 10,000.00 · ภาษีที่บริษัทออกให้ 309.28 · หักผู้รับ 0.00 · โอน 10,000.00 — (1) ไม่เปลี่ยน', () => {
    expect(
      doc.rows.map((row) => [row.payeeName, row.compensationText, row.whtPaidByPayerText, row.whtWithheldText, row.transferText]),
    ).toEqual([
      ['หนึ่ง หักปกติ', '10,000.00', '0.00', '300.00', '9,700.00'],
      ['สอง ออกให้ตลอดไป', '10,000.00', '309.28', '0.00', '10,000.00'],
      ['สาม ออกให้ครั้งเดียว', '10,000.00', '300.00', '0.00', '10,000.00'],
    ])
    // ยอดรวมภาษีเดิม (gross/wht รวมภาษีที่ออกให้) ยังอยู่สำหรับผู้ใช้เดิม
    expect(doc.rows[1]?.grossText).toBe('10,309.28')
  })

  it('แถวรวม: ค่าตอบแทน 30,000.00 · ภาษีที่บริษัทออกให้ 609.28 · หักผู้รับ 300.00 · โอน 29,700.00 + มีหมายเหตุ', () => {
    expect(doc.totalCompensationText).toBe('30,000.00')
    expect(doc.totalWhtPaidByPayerText).toBe('609.28')
    expect(doc.totalWhtWithheldText).toBe('300.00')
    expect(doc.totalTransferText).toBe('29,700.00')
    expect(doc.hasPayerBorneTax).toBe(true)
  })

  it('รอบที่หัก ณ ที่จ่ายตามปกติทั้งหมด ⇒ ภาษีที่บริษัทออกให้ 0.00 และไม่มีหมายเหตุ', () => {
    const normal = buildPayoutSummaryDoc(batch([item()]), ISSUER)
    expect(normal.totalCompensationText).toBe('8,500.00')
    expect(normal.totalWhtPaidByPayerText).toBe('0.00')
    expect(normal.totalWhtWithheldText).toBe('255.00')
    expect(normal.hasPayerBorneTax).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildRevenueReconciliation,
  pendingReceiptBreakdown,
  pendingReceiptInvoiceSatang,
} from '@/lib/reports/finance/revenue-reconciliation'

/** U44 — บรรทัดกระทบยอดรายงานรายได้ ↔ ใบกำกับภาษี (ยอดก่อน VAT · satang) */

const lineOf = (result: ReturnType<typeof buildRevenueReconciliation>, key: string): number | undefined =>
  result.lines.find((line) => line.key === key)?.amountSatang

describe('U44 — กระทบยอดรายงานรายได้กับใบกำกับภาษี', () => {
  it('เคส UAT: ใบกำกับ 373000 − Adjustment ลดยอดรอใบลดหนี้ 10000 = รายงาน 363000 (ลงพอดี)', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 363_000,
      revenues: [
        { grossSatang: 124_000, invoiced: true },
        { grossSatang: 124_000, invoiced: true },
        { grossSatang: 125_000, invoiced: true },
      ],
      adjustments: [{ adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: false }],
      notes: [],
    })
    expect(lineOf(result, 'invoiced')).toBe(373_000)
    expect(lineOf(result, 'awaitingCredit')).toBe(10_000)
    expect(lineOf(result, 'reportTotal')).toBe(363_000)
    expect(result.balanced).toBe(true)
    expect(result.differenceSatang).toBe(0)
    expect(result.lines.some((line) => line.key === 'difference')).toBe(false)
    // ไม่มีรายได้ที่ยังไม่ออกใบ ⇒ ไม่โชว์บรรทัดนั้น
    expect(result.lines.some((line) => line.key === 'uninvoiced')).toBe(false)
  })

  it('ออกใบลดหนี้แล้ว ⇒ ย้ายจาก "รอใบลดหนี้" ไปบรรทัดใบลดหนี้ ยังลงเท่าเดิม', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 363_000,
      revenues: [{ grossSatang: 373_000, invoiced: true }],
      adjustments: [{ adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: true }],
      notes: [{ noteType: 'credit', amountBeforeVatSatang: 10_000 }],
    })
    expect(lineOf(result, 'creditNotes')).toBe(10_000)
    expect(lineOf(result, 'awaitingCredit')).toBe(0)
    expect(result.balanced).toBe(true)
  })

  it('Adjustment เพิ่มยอด: รอใบเพิ่มหนี้ / มีใบเพิ่มหนี้แล้ว บวกเข้ายอดคาดหมาย', () => {
    const awaiting = buildRevenueReconciliation({
      reportTotalSatang: 105_000,
      revenues: [{ grossSatang: 100_000, invoiced: true }],
      adjustments: [{ adjustmentType: 'increase', amountSatang: 5_000, invoiced: true, hasActiveNote: false }],
      notes: [],
    })
    expect(lineOf(awaiting, 'awaitingDebit')).toBe(5_000)
    expect(awaiting.balanced).toBe(true)

    const documented = buildRevenueReconciliation({
      reportTotalSatang: 105_000,
      revenues: [{ grossSatang: 100_000, invoiced: true }],
      adjustments: [{ adjustmentType: 'increase', amountSatang: 5_000, invoiced: true, hasActiveNote: true }],
      notes: [{ noteType: 'debit', amountBeforeVatSatang: 5_000 }],
    })
    expect(lineOf(documented, 'debitNotes')).toBe(5_000)
    expect(documented.balanced).toBe(true)
  })

  it('รายได้ที่ยังไม่ออกใบกำกับ + Adjustment ของมัน แยกบรรทัด และยังลง', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 100_000 + 50_000 - 2_000,
      revenues: [
        { grossSatang: 100_000, invoiced: true },
        { grossSatang: 50_000, invoiced: false },
      ],
      adjustments: [{ adjustmentType: 'decrease', amountSatang: 2_000, invoiced: false, hasActiveNote: false }],
      notes: [],
    })
    expect(lineOf(result, 'uninvoiced')).toBe(50_000)
    expect(lineOf(result, 'uninvoicedAdjustments')).toBe(-2_000)
    expect(lineOf(result, 'awaitingCredit')).toBe(0)
    expect(result.balanced).toBe(true)
  })

  it('กระทบยอดไม่ลง (ใบลดหนี้ไม่อ้าง Adjustment) ⇒ แสดงผลต่าง ไม่กลบ', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 373_000,
      revenues: [{ grossSatang: 373_000, invoiced: true }],
      adjustments: [],
      notes: [{ noteType: 'credit', amountBeforeVatSatang: 3_000 }],
    })
    expect(result.balanced).toBe(false)
    expect(result.differenceSatang).toBe(3_000)
    const diff = result.lines.at(-1)
    expect(diff).toMatchObject({ key: 'difference', sign: 'diff', amountSatang: 3_000 })
  })

  it('ยอดใบลดหนี้ไม่เท่ายอด Adjustment ⇒ ผลต่างเท่าส่วนต่างพอดี', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 90_000,
      revenues: [{ grossSatang: 100_000, invoiced: true }],
      adjustments: [{ adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: true }],
      notes: [{ noteType: 'credit', amountBeforeVatSatang: 8_000 }],
    })
    expect(result.differenceSatang).toBe(-2_000)
    expect(result.balanced).toBe(false)
  })

  it('ไม่มีข้อมูล ⇒ 0 ทุกบรรทัดและลง', () => {
    const result = buildRevenueReconciliation({ reportTotalSatang: 0, revenues: [], adjustments: [], notes: [] })
    expect(result.balanced).toBe(true)
    expect(result.lines.every((line) => line.amountSatang === 0)).toBe(true)
  })

  it('ยอดที่ไม่ใช่สตางค์จำนวนเต็มถูกปฏิเสธ', () => {
    expect(() =>
      buildRevenueReconciliation({
        reportTotalSatang: 0,
        revenues: [{ grossSatang: 1.5, invoiced: true }],
        adjustments: [],
        notes: [],
      }),
    ).toThrow(RangeError)
  })
})

describe('mytester3 J3-03 — ใบกำกับเมื่อรับชำระ: "ยอดตามใบกำกับภาษี" = ใบที่ออกจริง + บรรทัดรอรับชำระ', () => {
  it('รอบรับเงินบางส่วน: ใบแจ้งหนี้ 1,000 ออกใบแล้ว 600 ⇒ ตามใบกำกับ 600 + รอรับชำระ 400 · ยังลงตัว', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 250_000,
      revenues: [
        { grossSatang: 100_000, invoiced: true },
        { grossSatang: 150_000, invoiced: true },
      ],
      adjustments: [],
      notes: [],
      invoicedBatches: [
        { batchBeforeVatSatang: 100_000, issuedBeforeVatSatang: 60_000, inRangeGrossSatang: 100_000 },
        { batchBeforeVatSatang: 150_000, issuedBeforeVatSatang: 150_000, inRangeGrossSatang: 150_000 },
      ],
    })
    expect(lineOf(result, 'invoiced')).toBe(210_000)
    expect(lineOf(result, 'pendingReceipt')).toBe(40_000)
    expect(result.balanced).toBe(true)
  })

  it('ใบกำกับเต็มรอบ ⇒ ไม่มีบรรทัดรอรับชำระ (ผลเดิม)', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 100_000,
      revenues: [{ grossSatang: 100_000, invoiced: true }],
      adjustments: [],
      notes: [],
      invoicedBatches: [{ batchBeforeVatSatang: 100_000, issuedBeforeVatSatang: 100_000, inRangeGrossSatang: 100_000 }],
    })
    expect(lineOf(result, 'invoiced')).toBe(100_000)
    expect(result.lines.some((line) => line.key === 'pendingReceipt')).toBe(false)
  })

  it('รอบคร่อมช่วง ⇒ ส่วนรอรับชำระตามสัดส่วนรายได้ในช่วง (ปัดลง)', () => {
    expect(
      pendingReceiptInvoiceSatang([
        { batchBeforeVatSatang: 300_000, issuedBeforeVatSatang: 100_001, inRangeGrossSatang: 100_000 },
      ]),
    ).toBe(66_666)
    // ออกใบเกินใบแจ้งหนี้ (ไม่ควรเกิด) ⇒ ไม่ติดลบ
    expect(
      pendingReceiptInvoiceSatang([{ batchBeforeVatSatang: 100, issuedBeforeVatSatang: 200, inRangeGrossSatang: 100 }]),
    ).toBe(0)
  })
})


describe('mytester3 LR3-04 — แยก "รับชำระแล้ว รอออกใบ" · ส่วนที่ปรับลดก่อนออกใบไม่ปน "รอรับชำระ"', () => {
  it('BL-2569-011: รับ 1,015 + ค่าธรรมเนียม ยังไม่ออกใบ ⇒ บรรทัด "รับชำระแล้ว รอออกใบ" ไม่ใช่ "รอรับชำระ" · ลงตัว', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 100_000,
      revenues: [{ grossSatang: 100_000, invoiced: true }],
      adjustments: [],
      notes: [],
      invoicedBatches: [
        {
          batchBeforeVatSatang: 100_000,
          issuedBeforeVatSatang: 5_000,
          inRangeGrossSatang: 100_000,
          receivedNotInvoicedBeforeVatSatang: 97_000,
        },
      ],
    })
    expect(lineOf(result, 'receivedNotInvoiced')).toBe(95_000)
    expect(result.lines.some((line) => line.key === 'pendingReceipt')).toBe(false)
    expect(result.balanced).toBe(true)
  })

  it('BL-2569-009: ลด 1,000 ก่อนออกใบ (ไม่ต้องออกใบลดหนี้) ⇒ ไม่ขึ้นรอรับชำระ/รอใบลดหนี้ · ลงตัว + หมายเหตุครอบกรณีไม่ต้องออก', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: 1_200_000 - 100_000,
      revenues: [{ grossSatang: 1_200_000, invoiced: true }],
      adjustments: [{ adjustmentType: 'decrease', amountSatang: 100_000, invoiced: true, hasActiveNote: false }],
      notes: [],
      invoicedBatches: [
        {
          batchBeforeVatSatang: 1_200_000,
          issuedBeforeVatSatang: 1_100_000,
          inRangeGrossSatang: 1_200_000,
          uninvoicedReductionBeforeVatSatang: 100_000,
        },
      ],
    })
    expect(lineOf(result, 'invoiced')).toBe(1_100_000)
    expect(result.lines.some((line) => line.key === 'pendingReceipt')).toBe(false)
    expect(lineOf(result, 'awaitingCredit')).toBe(0)
    expect(result.balanced).toBe(true)
    expect(result.note).toContain('ไม่ต้องออกใบลดหนี้')
  })

  it('สามส่วนรวมเท่ายอดยังไม่ออกใบเดิมทุกสตางค์ (รวมรอบคร่อมช่วง)', () => {
    const batches = [
      {
        batchBeforeVatSatang: 300_000,
        issuedBeforeVatSatang: 100_001,
        inRangeGrossSatang: 100_000,
        uninvoicedReductionBeforeVatSatang: 10_001,
        receivedNotInvoicedBeforeVatSatang: 50_003,
      },
    ]
    const parts = pendingReceiptBreakdown(batches)
    expect(parts.receivedSatang + parts.awaitingPaymentSatang + parts.reductionSatang).toBe(pendingReceiptInvoiceSatang(batches))
    expect(Object.values(parts).every((value) => Number.isInteger(value) && value >= 0)).toBe(true)
  })
})

describe('mytester5 J5-01 — ส่วนที่ลดก่อนออกใบของ Adjustment ที่ลดคร่อม (มีใบลดหนี้ส่วนเกินแล้ว) ไม่ขึ้น "รอรับชำระ"', () => {
  // ตัวเลขจริงของ BL-2569-003: ใบแจ้งหนี้ก่อน VAT 2,462.51 · ใบเสร็จฯ ออกแล้ว 1,401.87 ⇒ ยังไม่ออกใบ V = 1,060.64
  const BATCH = 246_251
  const ISSUED = 140_187
  const batchOf = (extra: { reduction?: number; received?: number; issued?: number } = {}) => ({
    batchBeforeVatSatang: BATCH,
    issuedBeforeVatSatang: extra.issued ?? ISSUED,
    inRangeGrossSatang: BATCH,
    uninvoicedReductionBeforeVatSatang: extra.reduction ?? 0,
    receivedNotInvoicedBeforeVatSatang: extra.received ?? 0,
  })

  it('(ก) ลดก่อนรับเงิน: Adjustment −100 อยู่ในส่วนที่ยังไม่ออกใบทั้งหมด ⇒ รอรับชำระ 960.64 · ไม่มีรอใบลดหนี้ · ลงตัว', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: BATCH - 10_000,
      revenues: [{ grossSatang: BATCH, invoiced: true }],
      adjustments: [{ adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: false }],
      notes: [],
      invoicedBatches: [batchOf({ reduction: 10_000 })],
    })
    expect(lineOf(result, 'invoiced')).toBe(ISSUED)
    expect(lineOf(result, 'pendingReceipt')).toBe(96_064)
    expect(lineOf(result, 'awaitingCredit')).toBe(0)
    expect(result.differenceSatang).toBe(0)
  })

  it('(ข) ลดคร่อม: −100 + −1,000 · ใบลดหนี้ส่วนเกิน 39.36 อ้าง −1,000 · R = 1,060.64 ⇒ ไม่มีรอรับชำระ · ผลต่าง 0 (เดิม −960.64)', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: BATCH - 110_000,
      revenues: [{ grossSatang: BATCH, invoiced: true }],
      adjustments: [
        { adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: false },
        { adjustmentType: 'decrease', amountSatang: 100_000, invoiced: true, hasActiveNote: true },
      ],
      notes: [{ noteType: 'credit', amountBeforeVatSatang: 3_936 }],
      invoicedBatches: [batchOf({ reduction: 106_064 })],
    })
    expect(lineOf(result, 'invoiced')).toBe(ISSUED)
    expect(result.lines.some((line) => line.key === 'pendingReceipt')).toBe(false)
    expect(lineOf(result, 'creditNotes')).toBe(3_936)
    expect(lineOf(result, 'awaitingCredit')).toBe(0)
    expect(result.differenceSatang).toBe(0)
    expect(result.balanced).toBe(true)
  })

  it('(ข) ก่อนบันทึกใบลดหนี้: ทั้งสอง Adjustment ยังรอเอกสาร ⇒ รอใบลดหนี้เฉพาะส่วนเกิน 39.36 · ลงตัว', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: BATCH - 110_000,
      revenues: [{ grossSatang: BATCH, invoiced: true }],
      adjustments: [
        { adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: false },
        { adjustmentType: 'decrease', amountSatang: 100_000, invoiced: true, hasActiveNote: false },
      ],
      notes: [],
      invoicedBatches: [batchOf({ reduction: 106_064 })],
    })
    expect(result.lines.some((line) => line.key === 'pendingReceipt')).toBe(false)
    expect(lineOf(result, 'awaitingCredit')).toBe(3_936)
    expect(result.differenceSatang).toBe(0)
  })

  it('(ค) ลดหลังรับครบ: ออกใบครบรอบแล้ว · ใบลดหนี้เต็ม 1,000 อ้าง Adjustment ⇒ ลงตัว', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: BATCH - 100_000,
      revenues: [{ grossSatang: BATCH, invoiced: true }],
      adjustments: [{ adjustmentType: 'decrease', amountSatang: 100_000, invoiced: true, hasActiveNote: true }],
      notes: [{ noteType: 'credit', amountBeforeVatSatang: 100_000 }],
      invoicedBatches: [batchOf({ issued: BATCH })],
    })
    expect(lineOf(result, 'invoiced')).toBe(BATCH)
    expect(lineOf(result, 'creditNotes')).toBe(100_000)
    expect(result.differenceSatang).toBe(0)
  })

  it('(ง) ใบเพิ่มหนี้ 20.00 อ้าง Adjustment เพิ่มยอด + รอบ BL-2569-003 ลดคร่อม ⇒ ใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้ = รายงาน', () => {
    const other = 100_000
    const result = buildRevenueReconciliation({
      reportTotalSatang: BATCH - 110_000 + other + 2_000,
      revenues: [
        { grossSatang: BATCH, invoiced: true },
        { grossSatang: other, invoiced: true },
      ],
      adjustments: [
        { adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: false },
        { adjustmentType: 'decrease', amountSatang: 100_000, invoiced: true, hasActiveNote: true },
        { adjustmentType: 'increase', amountSatang: 2_000, invoiced: true, hasActiveNote: true },
      ],
      notes: [
        { noteType: 'credit', amountBeforeVatSatang: 3_936 },
        { noteType: 'debit', amountBeforeVatSatang: 2_000 },
      ],
      invoicedBatches: [
        batchOf({ reduction: 106_064 }),
        { batchBeforeVatSatang: other, issuedBeforeVatSatang: other, inRangeGrossSatang: other },
      ],
    })
    expect(lineOf(result, 'invoiced')).toBe(ISSUED + other)
    expect(lineOf(result, 'debitNotes')).toBe(2_000)
    expect(result.lines.some((line) => line.key === 'pendingReceipt')).toBe(false)
    expect(result.differenceSatang).toBe(0)
  })

  it('(จ) รอบรับบางส่วนยังค้าง: รับแล้วรอออกใบ 300 + รอรับชำระที่เหลือ · ไม่มี Adjustment · ลงตัว', () => {
    const result = buildRevenueReconciliation({
      reportTotalSatang: BATCH,
      revenues: [{ grossSatang: BATCH, invoiced: true }],
      adjustments: [],
      notes: [],
      invoicedBatches: [batchOf({ received: 30_000 })],
    })
    expect(lineOf(result, 'receivedNotInvoiced')).toBe(30_000)
    expect(lineOf(result, 'pendingReceipt')).toBe(106_064 - 30_000)
    expect(result.differenceSatang).toBe(0)
  })

  it('ต่อรอบ: R ของ BL-2569-003 ไม่กลบยอดรอใบลดหนี้จริงของอีกรอบ (ออกใบครบแล้ว ลด 60 รอใบลดหนี้)', () => {
    const other = 100_000
    const result = buildRevenueReconciliation({
      reportTotalSatang: BATCH - 110_000 + other - 6_000,
      revenues: [
        { grossSatang: BATCH, invoiced: true },
        { grossSatang: other, invoiced: true },
      ],
      adjustments: [
        { adjustmentType: 'decrease', amountSatang: 10_000, invoiced: true, hasActiveNote: false, batchKey: 'BL-003' },
        { adjustmentType: 'decrease', amountSatang: 100_000, invoiced: true, hasActiveNote: true, batchKey: 'BL-003' },
        { adjustmentType: 'decrease', amountSatang: 6_000, invoiced: true, hasActiveNote: false, batchKey: 'BL-X' },
      ],
      notes: [{ noteType: 'credit', amountBeforeVatSatang: 3_936 }],
      invoicedBatches: [
        { ...batchOf({ reduction: 106_064 }), batchKey: 'BL-003' },
        { batchBeforeVatSatang: other, issuedBeforeVatSatang: other, inRangeGrossSatang: other, batchKey: 'BL-X' },
      ],
    })
    expect(lineOf(result, 'awaitingCredit')).toBe(6_000)
    expect(result.lines.some((line) => line.key === 'pendingReceipt')).toBe(false)
    expect(result.differenceSatang).toBe(0)
  })
})

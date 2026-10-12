import { describe, expect, it } from 'vitest'
import { buildRevenueReconciliation, pendingReceiptInvoiceSatang } from '@/lib/reports/finance/revenue-reconciliation'

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


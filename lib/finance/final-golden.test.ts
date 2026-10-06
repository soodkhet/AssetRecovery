import { describe, expect, it } from 'vitest'
import { advanceSettlement } from '@/lib/finance/advance-calc'
import { allocatePayeeAdvanceOffset, payoutTransferSatang } from '@/lib/finance/advance-offset-calc'
import { arOutstandingSatang } from '@/lib/finance/ar-calc'
import { commissionSatang, directCostSatang, splitDailyAmountSatang } from '@/lib/finance/compensation-calc'
import { grossProfit } from '@/lib/finance/gross-profit'
import { summarizePayoutBatch } from '@/lib/finance/payout-calc'
import { calculateServiceFeeRevenue, type ServiceFeeSnapshot } from '@/lib/finance/service-fee-calc'
import { calculateVat, calculateVatForRevenue } from '@/lib/finance/vat-calc'
import {
  calculatePayeeBatchWht,
  calculateWhtForPayee,
  estimateCustomerWhtForBilling,
  sumPayoutTaxSplit,
  type PayeeBatchWhtItem,
  type PayeeTaxProfileValues,
} from '@/lib/finance/wht-calc'
import { isHotelClaimOverCap } from '@/lib/field/hotel-claim'
import { receiptInvoiceAmounts } from '@/lib/sales/receipt-invoice'
import { substituteReceiptLimitProblem } from '@/lib/substitute-receipts/substitute-receipt'

/**
 * Final Test ด่าน 2 (การเงิน) — เทียบ **golden** ของ `uat/report/FINAL-coverage.md` ส่วน H + probe F.1
 * ทีละตัวเลขถึงสตางค์ ผ่าน pure module ตัวเดียวกับที่ service ใช้จริง (ไม่มีสูตรซ้ำในเทสต์)
 * ค่าคาดหวังทุกตัวคัดจาก golden ตรงตัว — ห้ามแก้ตามโค้ด ถ้าไม่ตรงคือบั๊ก (หรือ golden ผิด → NEEDS_DECISION)
 */

// ── A.3 Tax Profile (สตางค์) ────────────────────────────────────────────────
const TP1: PayeeTaxProfileValues = { whtPct: 3, whtBasis: 'before_vat', whtMinThresholdSatang: 100000 }
const TP2: PayeeTaxProfileValues = { whtPct: 3, whtBasis: 'before_vat', whtMinThresholdSatang: 100000 }
const TP3: PayeeTaxProfileValues = { whtPct: 2, whtBasis: 'before_vat', whtMinThresholdSatang: 100000 }
const TP4: PayeeTaxProfileValues = { whtPct: 3, whtBasis: 'gross_amount', whtMinThresholdSatang: 100000 }

// ── A.5 VAT V-1 / V-2 (DATE = เที่ยงคืน UTC) ───────────────────────────────
const VAT_PERIODS = [
  { id: 'V-1', ratePct: 7, effectiveFrom: new Date('2025-10-01T00:00:00Z'), effectiveTo: new Date('2026-09-30T00:00:00Z') },
  { id: 'V-2', ratePct: 7, effectiveFrom: new Date('2026-10-01T00:00:00Z'), effectiveTo: null },
]
const SEP = new Date('2026-09-15T05:00:00Z')
const OCT = new Date('2026-10-03T05:00:00Z')

// ── C.1 template (snapshot ในเคส) ───────────────────────────────────────────
const successFee = (ratePct: number): ServiceFeeSnapshot => ({
  model: 'SUCCESS_FEE', baseSatang: 0, ratePct, basis: 'debt_amount', failFeeSatang: null,
})
const flat = (chargeOnFail: boolean): ServiceFeeSnapshot => ({
  model: 'FLAT', baseSatang: chargeOnFail ? 300000 : 749000, ratePct: 0, basis: null,
  failFeeSatang: chargeOnFail ? 300000 : null,
})
/** มติ PO U165 — T4 (CO4) สำเร็จ 300000 / ไม่สำเร็จ 100000 */
const t4: ServiceFeeSnapshot = { model: 'FLAT', baseSatang: 300000, ratePct: 0, basis: null, failFeeSatang: 100000 }
const hybrid = (ratePct: number, chargeOnFail: boolean): ServiceFeeSnapshot => ({
  model: 'HYBRID', baseSatang: 200000, ratePct, basis: 'debt_amount',
  failFeeSatang: chargeOnFail ? 200000 : null,
})

function revenueOf(
  snapshot: ServiceFeeSnapshot,
  outcome: 'closed_success' | 'closed_fail',
  debt: number,
  vatMode: 'exclude_vat' | 'include_vat' | 'no_vat',
  revenueDate: Date,
) {
  const fee = calculateServiceFeeRevenue(snapshot, outcome, { debtAmountSatang: debt })
  const vat = calculateVatForRevenue({
    amountSatang: fee.grossSatang ?? 0,
    vatMode,
    revenueDate,
    vatRatePeriods: VAT_PERIODS,
  })
  return { gross: fee.grossSatang, beforeVat: vat.grossSatang, vat: vat.vatSatang, total: vat.totalSatang, rate: vat.vatRatePctUsed }
}

describe('H.1 — service fee / รายได้ / VAT ต่อเคส (§6.5–6.8)', () => {
  const sep = {
    'FT-15': revenueOf(successFee(5), 'closed_success', 1234567, 'exclude_vat', SEP),
    'FT-16': revenueOf(flat(false), 'closed_success', 2490000, 'include_vat', SEP),
    'FT-17': revenueOf(hybrid(3, true), 'closed_fail', 1200000, 'exclude_vat', SEP),
    'FT-18': revenueOf(hybrid(3, true), 'closed_success', 2345678, 'exclude_vat', SEP),
    'FT-19': revenueOf(t4, 'closed_success', 1500000, 'no_vat', SEP),
    'FT-20': revenueOf(t4, 'closed_success', 1590000, 'no_vat', SEP),
  }
  const oct = {
    'FT-03 r2': revenueOf(successFee(5), 'closed_success', 987654, 'exclude_vat', OCT),
    'FT-04': revenueOf(successFee(5), 'closed_success', 2000001, 'exclude_vat', OCT),
    'FT-06': revenueOf(flat(false), 'closed_success', 980000, 'include_vat', OCT),
    'FT-07 r2': revenueOf(flat(false), 'closed_success', 1850000, 'include_vat', OCT),
    'FT-09': revenueOf(hybrid(4, false), 'closed_success', 1500000, 'exclude_vat', OCT),
    'FT-11': revenueOf(hybrid(3, true), 'closed_success', 1111111, 'exclude_vat', OCT),
    'FT-12': revenueOf(t4, 'closed_fail', 1600000, 'no_vat', OCT),
    'FT-13 r1': revenueOf(t4, 'closed_fail', 3120000, 'no_vat', OCT),
    'FT-13 r2': revenueOf(t4, 'closed_success', 3120000, 'no_vat', OCT),
  }

  it.each([
    ['FT-15', sep['FT-15'], 61728, 61728, 4321, 66049],
    ['FT-16', sep['FT-16'], 749000, 700000, 49000, 749000],
    ['FT-17', sep['FT-17'], 200000, 200000, 14000, 214000],
    ['FT-18', sep['FT-18'], 270370, 270370, 18926, 289296],
    ['FT-19', sep['FT-19'], 300000, 300000, 0, 300000],
    ['FT-20', sep['FT-20'], 300000, 300000, 0, 300000],
    ['FT-03 r2', oct['FT-03 r2'], 49383, 49383, 3457, 52840],
    ['FT-04', oct['FT-04'], 100000, 100000, 7000, 107000],
    ['FT-06', oct['FT-06'], 749000, 700000, 49000, 749000],
    ['FT-07 r2', oct['FT-07 r2'], 749000, 700000, 49000, 749000],
    ['FT-09', oct['FT-09'], 260000, 260000, 18200, 278200],
    ['FT-11', oct['FT-11'], 233333, 233333, 16333, 249666],
    ['FT-12', oct['FT-12'], 100000, 100000, 0, 100000],
  ])('%s', (_label, actual, gross, beforeVat, vat, total) => {
    expect(actual).toMatchObject({ gross, beforeVat, vat, total })
  })

  it('FT-13 คิดทุกรอบอิสระ (U125) — r1 fail 100000 + r2 success 300000 = 400000 (U165)', () => {
    expect(oct['FT-13 r1'].total).toBe(100000)
    expect(oct['FT-13 r1'].total + oct['FT-13 r2'].total).toBe(400000)
  })

  it('FLAT cof=true เดิม (ไม่สำเร็จ = base) ยังได้ base เท่าเดิม', () => {
    expect(calculateServiceFeeRevenue(flat(true), 'closed_fail', { debtAmountSatang: 1 }).grossSatang).toBe(300000)
  })

  it('เคส fail ที่ไม่คิดเงิน = 0 (SUCCESS_FEE fail · FLAT cof=false fail · HYBRID cof=false fail)', () => {
    expect(calculateServiceFeeRevenue(successFee(5), 'closed_fail', { debtAmountSatang: 987654 }).grossSatang).toBe(0)
    expect(calculateServiceFeeRevenue(flat(false), 'closed_fail', { debtAmountSatang: 1 }).grossSatang).toBe(0)
    expect(calculateServiceFeeRevenue(hybrid(4, false), 'closed_fail', { debtAmountSatang: 1 }).grossSatang).toBe(0)
  })

  it('รวมรายได้ ก.ย. / ต.ค. ตรง golden + VAT หยิบแถว V-1 / V-2 (snapshot 7.00)', () => {
    const sum = (rows: Record<string, { beforeVat: number; vat: number; total: number }>) =>
      Object.values(rows).reduce(
        (acc, row) => ({ beforeVat: acc.beforeVat + row.beforeVat, vat: acc.vat + row.vat, total: acc.total + row.total }),
        { beforeVat: 0, vat: 0, total: 0 },
      )
    expect(sum(sep)).toEqual({ beforeVat: 1832098, vat: 86247, total: 1918345 })
    // FT-13 r1 + r2 นับทั้งคู่ (U125)
    expect(sum(oct)).toEqual({ beforeVat: 2542716, vat: 142990, total: 2685706 })
    expect(sep['FT-15'].rate).toBe(7)
    expect(oct['FT-04'].rate).toBe(7)
  })

  it('VAT effective-dated — อัตราเปลี่ยนจริงหยิบตามวันรายได้ (O71/J4) และไม่มีอัตรา = VAT_RATE_NOT_FOUND', () => {
    const changed = [
      { id: 'a', ratePct: 7, effectiveFrom: new Date('2025-10-01T00:00:00Z'), effectiveTo: new Date('2026-09-30T00:00:00Z') },
      { id: 'b', ratePct: 10, effectiveFrom: new Date('2026-10-01T00:00:00Z'), effectiveTo: null },
    ]
    expect(calculateVatForRevenue({ amountSatang: 100000, vatMode: 'exclude_vat', revenueDate: SEP, vatRatePeriods: changed }).vatSatang).toBe(7000)
    expect(calculateVatForRevenue({ amountSatang: 100000, vatMode: 'exclude_vat', revenueDate: OCT, vatRatePeriods: changed }).vatSatang).toBe(10000)
    expect(() => calculateVat({ amountSatang: 100000, vatMode: 'exclude_vat', vatRatePct: null })).toThrow(/VAT_RATE_NOT_FOUND|VAT/)
  })
})

describe('§6.2–6.4 — ค่าตอบแทนต่อเคส (D.4)', () => {
  it('N=3 วันเดียวกัน: เศษ 2 สตางค์ลงเคสแรก (FT-04 6668 · FT-07 6666 · FT-08 6666)', () => {
    expect(splitDailyAmountSatang(20000, 3)).toEqual([6668, 6666, 6666])
    expect(splitDailyAmountSatang(15000, 3)).toEqual([5000, 5000, 5000])
  })
  it('N=1 / N=2 เต็ม/ครึ่ง', () => {
    expect(splitDailyAmountSatang(20000, 1)).toEqual([20000])
    expect(splitDailyAmountSatang(30000, 2)).toEqual([15000, 15000])
  })
  it('commission ⟂ no_success · v1 50000 / v2 60000', () => {
    const v1 = { commissionSatang: 50000, noSuccessFeeSatang: 20000 }
    const v2 = { commissionSatang: 60000, noSuccessFeeSatang: 20000 }
    expect(commissionSatang('closed_success', v1)).toEqual({ expenseType: 'commission', grossSatang: 50000 })
    expect(commissionSatang('closed_success', v2)).toEqual({ expenseType: 'commission', grossSatang: 60000 })
    expect(commissionSatang('closed_fail', v2)).toEqual({ expenseType: 'no_success_fee', grossSatang: 20000 })
  })
})

// ── H.2 — WHT ต่อผู้รับต่อรอบ ────────────────────────────────────────────────
const inBase = (gross: number, source: PayeeBatchWhtItem['source']): PayeeBatchWhtItem => ({ grossSatang: gross, source })
const outBase = (gross: number): PayeeBatchWhtItem => ({ grossSatang: gross, source: { payeeTaxProfile: null, planWhtPct: null }, includedInBase: false })
const typeDefault = (tp: PayeeTaxProfileValues, plan: number | null = 5): PayeeBatchWhtItem['source'] => ({
  payeeTaxProfile: null, typeDefaultTaxProfile: tp, planWhtPct: plan,
})

describe('H.2 — WHT ต่อผู้รับต่อรอบ (§6.9–6.9.2)', () => {
  it('PY-1 in2 ฐาน 55000 < เกณฑ์ → 0', () => {
    const src = typeDefault(TP1, 3)
    const r = calculatePayeeBatchWht([inBase(20000, src), inBase(15000, src), inBase(20000, src)])
    expect(r.totalBaseSatang).toBe(55000)
    expect(r.totalWhtSatang).toBe(0)
    expect(r.lines.reduce((s, l) => s + l.netSatang, 0)).toBe(55000)
  })

  it('PY-2 out1 override TP-3 2% ชนะแผน 5% → 4600 (300/2000/300/2000)', () => {
    const src: PayeeBatchWhtItem['source'] = { payeeTaxProfile: TP3, typeDefaultTaxProfile: TP1, planWhtPct: 5 }
    const r = calculatePayeeBatchWht([
      inBase(15000, src), inBase(100000, src), inBase(15000, src), inBase(100000, src), outBase(120000),
    ])
    expect(r.totalBaseSatang).toBe(230000)
    expect(r.lines.map((l) => l.whtSatang)).toEqual([300, 2000, 300, 2000, 0])
    expect(r.lines[0]!.rate.source).toBe('payee')
    const gross = r.lines.reduce((s, l) => s + l.payoutGrossSatang, 0)
    const net = r.lines.reduce((s, l) => s + l.netSatang, 0)
    expect([gross, net]).toEqual([350000, 345400])
  })

  it('PY-3 out2 นิติ TP-2 3% → 10800 (900/3000/450/3000/450/3000)', () => {
    const src = typeDefault(TP2)
    const r = calculatePayeeBatchWht([
      inBase(30000, src), inBase(100000, src), inBase(15000, src), inBase(100000, src), inBase(15000, src), inBase(100000, src),
      outBase(80000), outBase(600000), outBase(50000),
    ])
    expect(r.totalBaseSatang).toBe(360000)
    expect(r.lines.slice(0, 6).map((l) => l.whtSatang)).toEqual([900, 3000, 450, 3000, 450, 3000])
    expect(r.lines[0]!.rate.source).toBe('type_default')
    expect(r.lines.reduce((s, l) => s + l.payoutGrossSatang, 0)).toBe(1090000)
    expect(r.lines.reduce((s, l) => s + l.netSatang, 0)).toBe(1079200)
  })

  it('PY-4 in2 40(2) 0% → ภาษี 0 ไม่มีเกณฑ์ gross 150000', () => {
    const src = typeDefault(TP1, 3)
    const r = calculatePayeeBatchWht(
      [20000, 15000, 20000, 20000, 15000, 60000].map((g) => inBase(g, src)),
      { incomeCategory: 'sec_40_2', section402Pct: 0 },
    )
    expect(r.totalBaseSatang).toBe(150000)
    expect(r.totalWhtSatang).toBe(0)
    expect(r.belowThreshold).toBe(false)
  })

  it('PY-5 out1 (2) ทบยอด 3% → 9897 (464/928/464/3093/464/928/464/3092) · gross 559897 net 550000', () => {
    const src = typeDefault(TP1)
    const r = calculatePayeeBatchWht(
      [
        inBase(15000, src), inBase(30000, src), inBase(15000, src), inBase(100000, src),
        inBase(15000, src), inBase(30000, src), inBase(15000, src), inBase(100000, src),
        outBase(150000), outBase(25000), outBase(45000), outBase(10000),
      ],
      { condition: 'pay_always' },
    )
    expect(r.totalBaseSatang).toBe(320000)
    expect(r.lines.slice(0, 8).map((l) => l.whtSatang)).toEqual([464, 928, 464, 3093, 464, 928, 464, 3092])
    // ลำดับส่วนแบ่งใน golden = FT-03 r1 · FT-03 r2 · FT-05 · FT-09 (เศษ 1 สตางค์สุดท้ายลงรายการ 100000 ตัวแรก)
    expect(r.totalWhtSatang).toBe(9897)
    expect(r.lines.reduce((s, l) => s + l.payoutGrossSatang, 0)).toBe(559897)
    expect(r.lines.reduce((s, l) => s + l.netSatang, 0)).toBe(550000)
    // เงินได้บน 50 ทวิ = ยอดในฐาน + ภาษี
    expect(r.lines.slice(0, 8).reduce((s, l) => s + l.payoutGrossSatang, 0)).toBe(329897)
  })

  it('PY-6 in1 40(2) 5% → 9917 (334/250/3000/1000/750/1000/333/250/3000)', () => {
    const src = typeDefault(TP1, 3)
    const r = calculatePayeeBatchWht(
      [6668, 5000, 60000, 20000, 15000, 20000, 6666, 5000, 60000].map((g) => inBase(g, src)).concat(outBase(80000)),
      { incomeCategory: 'sec_40_2', section402Pct: 5 },
    )
    expect(r.totalBaseSatang).toBe(198334)
    expect(r.lines.slice(0, 9).map((l) => l.whtSatang)).toEqual([334, 250, 3000, 1000, 750, 1000, 333, 250, 3000])
    expect(r.lines.reduce((s, l) => s + l.payoutGrossSatang, 0)).toBe(278334)
    expect(r.lines.reduce((s, l) => s + l.netSatang, 0)).toBe(268417)
  })

  it('PY-7 out1 (2) 3% → 3557 (464/3093) · gross 178557 net 175000', () => {
    const src = typeDefault(TP1)
    const r = calculatePayeeBatchWht([inBase(15000, src), inBase(100000, src), outBase(60000)], { condition: 'pay_always' })
    expect(r.lines.slice(0, 2).map((l) => l.whtSatang)).toEqual([464, 3093])
    expect(r.lines.reduce((s, l) => s + l.payoutGrossSatang, 0)).toBe(178557)
    expect(r.lines.reduce((s, l) => s + l.netSatang, 0)).toBe(175000)
  })

  it('PY-8 out2 (3) 3% → 4800 (450/3000/450/900) · gross 764800 net 760000', () => {
    const src = typeDefault(TP2)
    const r = calculatePayeeBatchWht(
      [inBase(15000, src), inBase(100000, src), inBase(15000, src), inBase(30000, src), outBase(600000)],
      { condition: 'pay_once' },
    )
    expect(r.lines.slice(0, 4).map((l) => l.whtSatang)).toEqual([450, 3000, 450, 900])
    expect(r.lines.reduce((s, l) => s + l.payoutGrossSatang, 0)).toBe(764800)
    expect(r.lines.reduce((s, l) => s + l.netSatang, 0)).toBe(760000)
  })
})

describe('F.1 probe สูตร (pure) — P-03 / P-04 / P-07 / P-10 / P-11 / P-05 / P-06', () => {
  it('P-03 inhouse นิติบุคคล (ช่องว่าง) แผน 3% ฐาน 200000 → หัก 6000 + เตือน fallback', () => {
    const r = calculateWhtForPayee({ grossSatang: 200000, source: { payeeTaxProfile: null, typeDefaultTaxProfile: null, planWhtPct: 3 } })
    expect(r?.whtSatang).toBe(6000)
    expect(r?.rate.source).toBe('plan')
    expect(r?.rate.warning).toBeTruthy()
  })
  it('P-04 ช่องว่าง + ไม่มีแผน → rateMissing (ไม่ throw — ผู้สร้างรอบบล็อก WHT_RATE_MISSING)', () => {
    const r = calculatePayeeBatchWht([{ grossSatang: 200000, source: { payeeTaxProfile: null, typeDefaultTaxProfile: null, planWhtPct: null } }])
    expect(r.rateMissing).toBe(true)
    expect(r.totalWhtSatang).toBe(0)
  })
  it('P-07 TP-4 gross_amount ฐาน 100000 + VAT 7000 → 3210', () => {
    expect(calculateWhtForPayee({ grossSatang: 100000, vatSatang: 7000, source: { payeeTaxProfile: TP4, planWhtPct: null } })?.whtSatang).toBe(3210)
  })
  it('P-10 ค้างคืน 40000 · net 30000 → หัก 30000 โอน 0 ยก 10000 (U68)', () => {
    const r = allocatePayeeAdvanceOffset([30000], [{ advanceId: 'adv', outstandingSatang: 40000 }])
    expect(r.totalOffsetSatang).toBe(30000)
    expect(r.lineTransferSatang).toEqual([0])
    expect(r.carriedForward).toEqual([{ advanceId: 'adv', outstandingSatang: 10000 }])
  })
  it('P-11 ทดรอง 100000 ใช้ 100000 → คืน 0 ไม่มีเบิกส่วนเกิน', () => {
    expect(advanceSettlement({ requestedSatang: 100000, approvedSatang: 100000, usedSatang: 100000 })).toEqual({
      returnSatang: 0, excessSatang: 0, needsExtraClaim: false,
    })
  })
  it('P-05 ค่าที่พัก 80001 / 1 คืน เกินเพดาน 80000 · เท่าเพดานพอดี (FT-04) ผ่าน · 2 คืน 90000 (FT-01) ผ่าน · ไม่จำกัด', () => {
    expect(isHotelClaimOverCap({ amountSatang: 80001, maxPerNightSatang: 80000, nights: 1 })).toBe(true)
    expect(isHotelClaimOverCap({ amountSatang: 80000, maxPerNightSatang: 80000, nights: 1 })).toBe(false)
    expect(isHotelClaimOverCap({ amountSatang: 90000, maxPerNightSatang: 80000, nights: 2 })).toBe(false)
    expect(isHotelClaimOverCap({ amountSatang: 600000, maxPerNightSatang: null, nights: 1 })).toBe(false)
  })
  it('P-06 CRT เพดาน 50000/ใบ 300000/เดือน — 50000 พอดีผ่าน · 50001 เกินใบ · สะสมเกินเดือน', () => {
    const limits = { maxPerDocSatang: 50000, maxPerMonthSatang: 300000 }
    expect(substituteReceiptLimitProblem({ ...limits, totalSatang: 50000, monthUsedSatang: 0 })).toBeNull()
    expect(substituteReceiptLimitProblem({ ...limits, totalSatang: 50001, monthUsedSatang: 0 })?.kind).toBe('per_doc')
    expect(substituteReceiptLimitProblem({ ...limits, totalSatang: 40000, monthUsedSatang: 260001 })?.kind).toBe('per_month')
    expect(substituteReceiptLimitProblem({ ...limits, totalSatang: 40000, monthUsedSatang: 260000 })).toBeNull()
  })
})

describe('H.3 — เงินทดรอง (§6.13/6.14)', () => {
  it.each([
    ['ADV-1', 300000, 245000, 55000, 0],
    ['ADV-2', 200000, 210000, 0, 10000],
    ['ADV-3', 100000, 60000, 40000, 0],
    ['ADV-4', 150000, 120000, 30000, 0],
  ])('%s', (_k, approved, used, ret, excess) => {
    const r = advanceSettlement({ requestedSatang: approved, approvedSatang: approved, usedSatang: used })
    expect([r.returnSatang, r.excessSatang]).toEqual([ret, excess])
  })
  it('ADV-1 หักกลบ PY-6 → โอน 213417', () => {
    expect(payoutTransferSatang(268417, 55000)).toBe(213417)
  })
})

describe('H.4 — รอบจ่าย (§6.10) + H.6 แยกภาษี U109/U114', () => {
  const item = (gross: number, wht: number) => ({ grossSatang: gross, whtSatang: wht, netSatang: gross - wht })
  it.each([
    ['PB-S-IN', [item(55000, 0)], 55000, 0, 55000],
    ['PB-S-OUT', [item(350000, 4600), item(1090000, 10800)], 1440000, 15400, 1424600],
    ['PB-O-IN1', [item(150000, 0)], 150000, 0, 150000],
    ['PB-O-OUT1', [item(559897, 9897)], 559897, 9897, 550000],
    ['PB-O-IN2', [item(278334, 9917)], 278334, 9917, 268417],
    ['PB-O-OUT2', [item(178557, 3557), item(764800, 4800)], 943357, 8357, 935000],
  ])('%s', (_k, items, gross, wht, net) => {
    expect(summarizePayoutBatch(items)).toMatchObject({ grossSatang: gross, whtSatang: wht, netSatang: net })
  })
  it('H.6 ต.ค. จ่ายแล้ว: หักจากผู้รับ 0 / บริษัทออกให้ 9897 · ก.ย. 15400 / 0', () => {
    const oct = sumPayoutTaxSplit([
      { grossSatang: 150000, whtSatang: 0, netSatang: 150000, whtCondition: 'withhold' },
      { grossSatang: 559897, whtSatang: 9897, netSatang: 550000, whtCondition: 'pay_always' },
    ])
    expect([oct.whtWithheldSatang, oct.whtPaidByPayerSatang]).toEqual([0, 9897])
    const sep = sumPayoutTaxSplit([
      { grossSatang: 350000, whtSatang: 4600, netSatang: 345400, whtCondition: 'withhold' },
      { grossSatang: 1090000, whtSatang: 10800, netSatang: 1079200, whtCondition: 'withhold' },
    ])
    expect([sep.whtWithheldSatang, sep.whtPaidByPayerSatang]).toEqual([15400, 0])
  })
})

describe('H.5 — วางบิล / รับเงิน / ใบกำกับ / AR (§6.8.2, §6.11, §6.16)', () => {
  it('§6.16 ประมาณภาษีลูกค้าหัก 3% (BL-001/003/004/006/007) / NULL (BL-002/005/008)', () => {
    const est = (beforeVat: number, total: number, pct: number | null) =>
      estimateCustomerWhtForBilling({ amountBeforeVatSatang: beforeVat, totalSatang: total, recordedWhtSatang: 0, whtPct: pct })
    expect(est(61728, 66049, 3).whtSatang).toBe(1852)
    expect(est(270370, 289296, 3).whtSatang).toBe(8111)
    expect(est(200000, 214000, 3).whtSatang).toBe(6000)
    expect(est(49383, 52840, 3)).toMatchObject({ whtSatang: 1481, expectedReceiptSatang: 51359 })
    expect(est(260000, 278200, 3).whtSatang).toBe(7800)
    expect(est(700000, 749000, null).whtSatang).toBe(0)
  })

  it('§6.8.2 INV-0001 ปิดยอด 61728+4321 · INV-0002 270370+18926 · INV-0005 260000+18200 (INV-0004 ยกเลิกไม่นับ)', () => {
    const inv = (beforeVat: number, vat: number, paid: number) =>
      receiptInvoiceAmounts({ basis: { billedBeforeVatSatang: beforeVat, billedVatSatang: vat, billedVatRatesPct: [7] }, prior: [], paidSatang: paid, vatRatePct: 7 })
    expect(inv(61728, 4321, 64197 + 1852)).toMatchObject({ totalBeforeVatSatang: 61728, vatSatang: 4321, coversRemainder: true })
    expect(inv(270370, 18926, 281185 + 8111)).toMatchObject({ totalBeforeVatSatang: 270370, vatSatang: 18926, coversRemainder: true })
    expect(inv(260000, 18200, 270400 + 7800)).toMatchObject({ totalBeforeVatSatang: 260000, vatSatang: 18200, coversRemainder: true })
  })

  it('§6.8.2 INV-0003 รับบางส่วน 400000 → VAT 26168 ก่อน VAT 373832', () => {
    const r = receiptInvoiceAmounts({
      basis: { billedBeforeVatSatang: 700000, billedVatSatang: 49000, billedVatRatesPct: [7] },
      prior: [],
      paidSatang: 400000,
      vatRatePct: 7,
    })
    expect(r).toMatchObject({ vatSatang: 26168, totalBeforeVatSatang: 373832, coversRemainder: false })
  })

  it('§6.11 AR สิ้น ต.ค. = 923040 (ยอดตามเอกสาร = ใบแจ้งหนี้ − CN + DN)', () => {
    const rows = [
      { totalSatang: 66049 + 10700, receivedSatang: 64197, whtWithheldByCustomerSatang: 1852, bankFeeWrittenOffSatang: 0 }, // BL-001 + DN-1
      { totalSatang: 749000 - 53500, receivedSatang: 400000, whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }, // BL-002 − CN-1
      { totalSatang: 289296, receivedSatang: 281185, whtWithheldByCustomerSatang: 8111, bankFeeWrittenOffSatang: 0 }, // BL-003
      { totalSatang: 214000, receivedSatang: 0, whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }, // BL-004 (ADJ-1 ไม่มีใบลดหนี้)
      { totalSatang: 600000, receivedSatang: 250000, whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }, // BL-005
      { totalSatang: 52840, receivedSatang: 0, whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }, // BL-006
      { totalSatang: 278200, receivedSatang: 270400, whtWithheldByCustomerSatang: 7800, bankFeeWrittenOffSatang: 0 }, // BL-007
      { totalSatang: 400000, receivedSatang: 400000, whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }, // BL-008 (U165)
    ]
    const each = rows.map(arOutstandingSatang)
    expect(each).toEqual([10700, 295500, 0, 214000, 350000, 52840, 0, 0])
    expect(each.reduce((s, v) => s + v, 0)).toBe(923040)
  })
})

describe('H.7 — กำไรขั้นต้น (§6.12)', () => {
  it('FT-13: 400000 − 150000 = 250000 margin 62.50% (U165)', () => {
    const cost = directCostSatang({ fuelSatang: 40000, allowanceSatang: 30000, commissionSatang: 20000 + 60000 })
    expect(cost).toBe(150000)
    const gp = grossProfit({ revenueSatang: 400000, directCostSatang: cost })
    expect(gp.grossProfitSatang).toBe(250000)
    expect(gp.marginPct).toBeCloseTo(62.5, 10)
  })
  it('FT-05: revenue 0 → margin null (แสดง N/A) ห้ามหารศูนย์', () => {
    const gp = grossProfit({ revenueSatang: 0, directCostSatang: 45000 })
    expect(gp).toMatchObject({ grossProfitSatang: -45000, marginPct: null })
  })
})

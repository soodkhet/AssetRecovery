import { describe, expect, it } from 'vitest'
import {
  assertBillingBatchDeletable,
  assertBillingBatchSendable,
  assertHasRevenueToBill,
  assertRevenueEditable,
  billingPeriodLabel,
  canTransitionBillingBatch,
  periodStartOf,
  resolveBillingStatusAfterReceipt,
  summarizeBillingBatch,
  toBangkokDateOnly,
} from '@/lib/revenue/revenue'

/** `19` §7.2/§9/§10/§11 · `23` §6.8 — กติกาของรอบวางบิล (pure) */

function codeOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
  return 'NO_ERROR'
}

describe('toBangkokDateOnly', () => {
  it('เคสที่ปิดตอน 2 ทุ่มเวลาไทย = วันเดียวกับที่ผู้ใช้เห็น (ไม่ถอยไป 1 วันตาม UTC)', () => {
    // 30/09/2569 20:00 ไทย = 2026-09-30T13:00:00Z
    expect(toBangkokDateOnly(new Date('2026-09-30T13:00:00.000Z')).toISOString()).toBe('2026-09-30T00:00:00.000Z')
  })

  it('เคสที่ปิดตอนตี 5 ไทยของวันที่ 1 ต.ค. ยังเป็น 1 ต.ค. (ไม่ใช่ 30 ก.ย. ตาม UTC)', () => {
    // 01/10/2569 05:00 ไทย = 2026-09-30T22:00:00Z — รอยต่ออัตรา VAT 7% → 10%
    expect(toBangkokDateOnly(new Date('2026-09-30T22:00:00.000Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})

describe('billingPeriodLabel / periodStartOf', () => {
  it('ชื่อรอบเป็นเดือนไทย + ปี พ.ศ. (Rule 01)', () => {
    expect(billingPeriodLabel(new Date('2026-06-30T00:00:00.000Z'))).toBe('มิถุนายน 2569')
    expect(billingPeriodLabel(new Date('2026-01-15T00:00:00.000Z'))).toBe('มกราคม 2569')
    expect(billingPeriodLabel(new Date('2026-12-31T00:00:00.000Z'))).toBe('ธันวาคม 2569')
  })

  it('ต้นเดือนของวันตัดรอบ = ขอบล่างของช่วงที่ดึงรายได้เข้ารอบ', () => {
    expect(periodStartOf(new Date('2026-08-31T00:00:00.000Z')).toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('state machine (`23` §6.8)', () => {
  it('draft → sent → partially_paid → paid และข้าม partially_paid ได้', () => {
    expect(canTransitionBillingBatch('draft', 'sent')).toBe(true)
    expect(canTransitionBillingBatch('sent', 'partially_paid')).toBe(true)
    expect(canTransitionBillingBatch('sent', 'paid')).toBe(true)
    expect(canTransitionBillingBatch('partially_paid', 'paid')).toBe(true)
  })

  it('ห้ามถอยหลัง / ห้ามข้ามจาก draft ไป paid', () => {
    expect(canTransitionBillingBatch('draft', 'paid')).toBe(false)
    expect(canTransitionBillingBatch('sent', 'draft')).toBe(false)
    expect(canTransitionBillingBatch('paid', 'sent')).toBe(false)
  })

  it('ส่งบิลได้จาก draft เท่านั้น — ส่งซ้ำโดน BILLING_BATCH_INVALID_STATUS', () => {
    expect(codeOf(() => assertBillingBatchSendable('draft'))).toBe('NO_ERROR')
    expect(codeOf(() => assertBillingBatchSendable('sent'))).toBe('BILLING_BATCH_INVALID_STATUS')
    expect(codeOf(() => assertBillingBatchSendable('paid'))).toBe('BILLING_BATCH_INVALID_STATUS')
  })

  it('`19` §10 — ลบได้เฉพาะรอบที่ยัง draft', () => {
    expect(codeOf(() => assertBillingBatchDeletable('draft'))).toBe('NO_ERROR')
    expect(codeOf(() => assertBillingBatchDeletable('sent'))).toBe('BILLING_BATCH_INVALID_STATUS')
    expect(codeOf(() => assertBillingBatchDeletable('partially_paid'))).toBe('BILLING_BATCH_INVALID_STATUS')
  })
})

describe('assertRevenueEditable (`19` §11 EDIT_BILLED_REVENUE)', () => {
  it('ยังไม่ผูกรอบ หรือรอบยัง draft = แก้ได้', () => {
    expect(codeOf(() => assertRevenueEditable(null))).toBe('NO_ERROR')
    expect(codeOf(() => assertRevenueEditable('draft'))).toBe('NO_ERROR')
  })

  it('รอบที่ส่งแล้ว/รับเงินแล้ว = แก้ไม่ได้ ต้องไป Adjustment', () => {
    expect(codeOf(() => assertRevenueEditable('sent'))).toBe('EDIT_BILLED_REVENUE')
    expect(codeOf(() => assertRevenueEditable('partially_paid'))).toBe('EDIT_BILLED_REVENUE')
    expect(codeOf(() => assertRevenueEditable('paid'))).toBe('EDIT_BILLED_REVENUE')
  })
})

describe('assertHasRevenueToBill', () => {
  it('ไม่มีรายได้ในรอบ = NO_REVENUE_TO_BILL', () => {
    expect(codeOf(() => assertHasRevenueToBill(0, 'company=x'))).toBe('NO_REVENUE_TO_BILL')
    expect(codeOf(() => assertHasRevenueToBill(3, 'company=x'))).toBe('NO_ERROR')
  })
})

describe('summarizeBillingBatch', () => {
  it('รวม gross/vat/total แยกช่อง — total ของรอบ = ผลรวม total ของทุกใบ', () => {
    expect(
      summarizeBillingBatch([
        { grossSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 },
        { grossSatang: 250_000, vatSatang: 17_500, totalSatang: 267_500 },
      ]),
    ).toEqual({ grossSatang: 350_000, vatSatang: 24_500, totalSatang: 374_500, revenueCount: 2 })
  })

  it('รอบว่าง = 0 ทุกช่อง (ตัวเรียกเป็นคนตัดสินว่าจะปล่อยให้ว่างไหม)', () => {
    expect(summarizeBillingBatch([])).toEqual({ grossSatang: 0, vatSatang: 0, totalSatang: 0, revenueCount: 0 })
  })
})

describe('resolveBillingStatusAfterReceipt (`19` §9.2 — จุดเสียบของไฟล์ 35)', () => {
  const base = { current: 'sent' as const, totalSatang: 107_000, whtWithheldByCustomerSatang: 0 }

  it('ยังไม่มีเงินเข้า = คงสถานะเดิม', () => {
    expect(resolveBillingStatusAfterReceipt({ ...base, receivedSatang: 0 })).toBe('sent')
  })

  it('รับบางส่วน = partially_paid', () => {
    expect(resolveBillingStatusAfterReceipt({ ...base, receivedSatang: 50_000 })).toBe('partially_paid')
  })

  it('รับครบ/เกิน = paid', () => {
    expect(resolveBillingStatusAfterReceipt({ ...base, receivedSatang: 107_000 })).toBe('paid')
    expect(resolveBillingStatusAfterReceipt({ ...base, receivedSatang: 120_000 })).toBe('paid')
  })

  it('A1 — WHT ที่ลูกค้าหักไว้นับเป็นรับชำระแล้ว (ไม่ค้างเป็นหนี้)', () => {
    expect(
      resolveBillingStatusAfterReceipt({
        ...base,
        receivedSatang: 104_000,
        whtWithheldByCustomerSatang: 3_000,
      }),
    ).toBe('paid')
  })

  it('รอบที่ยัง draft ไม่ถูกดันไป partially_paid (ต้องส่งบิลก่อน)', () => {
    expect(resolveBillingStatusAfterReceipt({ ...base, current: 'draft', receivedSatang: 50_000 })).toBe('draft')
  })
})

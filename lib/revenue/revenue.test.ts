import { describe, expect, it } from 'vitest'
import {
  assertBillingBatchDeletable,
  assertBillingBatchSendable,
  assertHasRevenueToBill,
  assertNoOpenDraftBatch,
  assertRevenueEditable,
  billableRevenueDateFilter,
  billingPeriodLabel,
  canTransitionBillingBatch,
  parseBillingPeriodLabel,
  isRevenueBillableAt,
  resolveBillingStatusAfterDocumentChange,
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

describe('billingPeriodLabel', () => {
  it('ชื่อรอบเป็นเดือนไทย + ปี พ.ศ. (Rule 01)', () => {
    expect(billingPeriodLabel(new Date('2026-06-30T00:00:00.000Z'))).toBe('มิถุนายน 2569')
    expect(billingPeriodLabel(new Date('2026-01-15T00:00:00.000Z'))).toBe('มกราคม 2569')
    expect(billingPeriodLabel(new Date('2026-12-31T00:00:00.000Z'))).toBe('ธันวาคม 2569')
  })

})

/** มติ PO U86 · BUG-155 — หลายรอบวางบิลต่อเดือน · รอบใหม่ดึงรายได้ค้างทั้งหมดถึงวันตัดรอบ */
describe('isRevenueBillableAt / billableRevenueDateFilter (U86)', () => {
  const cutoff = new Date('2026-11-05T00:00:00.000Z')
  const base = { status: 'ready_for_billing', billingBatchId: null, revenueDate: new Date('2026-11-01T00:00:00.000Z') }

  it('ไม่มีขอบล่าง — ช่วงคือ revenue_date ≤ วันตัดรอบ เท่านั้น', () => {
    expect(billableRevenueDateFilter(cutoff)).toEqual({ lte: cutoff })
  })

  it('รายได้ค้างจากเดือนก่อน (ต.ค.) ถูกดึงเข้ารอบที่ตัดรอบเดือน พ.ย.', () => {
    expect(isRevenueBillableAt({ ...base, revenueDate: new Date('2026-10-28T00:00:00.000Z') }, cutoff)).toBe(true)
  })

  it('รายได้วันเดียวกับวันตัดรอบถูกดึง · หลังวันตัดรอบไม่ถูกดึง', () => {
    expect(isRevenueBillableAt({ ...base, revenueDate: cutoff }, cutoff)).toBe(true)
    expect(isRevenueBillableAt({ ...base, revenueDate: new Date('2026-11-06T00:00:00.000Z') }, cutoff)).toBe(false)
  })

  it('ใบที่ผูกรอบอื่นแล้ว / billed / ลบแล้ว ไม่ถูกดึงซ้ำ (1:1)', () => {
    expect(isRevenueBillableAt({ ...base, billingBatchId: 'b1' }, cutoff)).toBe(false)
    expect(isRevenueBillableAt({ ...base, status: 'billed' }, cutoff)).toBe(false)
    expect(isRevenueBillableAt({ ...base, deletedAt: new Date() }, cutoff)).toBe(false)
  })
})

describe('assertNoOpenDraftBatch (U86)', () => {
  it('ไม่มีรอบร่างค้าง = ผ่าน', () => {
    expect(codeOf(() => assertNoOpenDraftBatch(null, 'บริษัท ก'))).toBe('NO_ERROR')
  })

  it('มีรอบร่างค้าง = BILLING_BATCH_INVALID_STATUS พร้อมข้อความบอกเลขรอบที่ค้าง (ไม่ใช่ข้อความกลาง)', () => {
    let caught: unknown
    try {
      assertNoOpenDraftBatch({ id: 'x', batchNumber: 'BL-2569-007', period: 'ตุลาคม 2569' }, 'บริษัท ก')
    } catch (error) {
      caught = error
    }
    const error = caught as { code: string; title: string; userMessage: string; context: Record<string, unknown> }
    expect(error.code).toBe('BILLING_BATCH_INVALID_STATUS')
    expect(error.title).toBe('มีรอบวางบิลร่างค้างอยู่')
    expect(error.userMessage).toContain('BL-2569-007')
    expect(error.userMessage).toContain('บริษัท ก')
    expect(error.userMessage).not.toMatch(/§|`\d{2}`/)
    expect(error.context).toMatchObject({ existingBatchNumber: 'BL-2569-007' })
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

  it('มติ O75 — paid → partially_paid ได้ (ใบเพิ่มหนี้หลังรับชำระครบ) · ห้ามกลับไป sent/draft', () => {
    expect(canTransitionBillingBatch('paid', 'partially_paid')).toBe(true)
    expect(canTransitionBillingBatch('paid', 'draft')).toBe(false)
  })

  it('มติ O75 — สถานะหลังเอกสารเปลี่ยนยอด (ยอดตามเอกสาร)', () => {
    const base = { receivedSatang: 1_284_000, whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }
    // ใบเพิ่มหนี้ 107.00 หลังรับชำระครบ ⇒ partially_paid
    expect(resolveBillingStatusAfterDocumentChange({ ...base, current: 'paid', totalSatang: 1_294_700 })).toBe(
      'partially_paid',
    )
    // ยกเลิกใบเพิ่มหนี้ / ใบลดหนี้ปิดยอด ⇒ paid (รวม WHT ที่ลูกค้าหัก)
    expect(resolveBillingStatusAfterDocumentChange({ ...base, current: 'partially_paid', totalSatang: 1_284_000 })).toBe(
      'paid',
    )
    expect(
      resolveBillingStatusAfterDocumentChange({
        current: 'partially_paid',
        totalSatang: 1_000_000,
        receivedSatang: 970_000,
        whtWithheldByCustomerSatang: 30_000,
        bankFeeWrittenOffSatang: 0,
      }),
    ).toBe('paid')
    // ยังค้าง / ยังไม่มีเงินเข้า ⇒ คงเดิม
    expect(resolveBillingStatusAfterDocumentChange({ ...base, current: 'partially_paid', totalSatang: 1_294_700 })).toBe(
      'partially_paid',
    )
    for (const current of ['draft', 'sent'] as const) {
      expect(resolveBillingStatusAfterDocumentChange({ ...base, current, totalSatang: 1_294_700 })).toBe(current)
    }
    expect(resolveBillingStatusAfterDocumentChange({ ...base, current: 'paid', totalSatang: 1_284_000 })).toBe('paid')
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
  const base = { current: 'sent' as const, totalSatang: 107_000, whtWithheldByCustomerSatang: 0, bankFeeWrittenOffSatang: 0 }

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
        bankFeeWrittenOffSatang: 0,
      }),
    ).toBe('paid')
  })

  it('รอบที่ยัง draft ไม่ถูกดันไป partially_paid (ต้องส่งบิลก่อน)', () => {
    expect(resolveBillingStatusAfterReceipt({ ...base, current: 'draft', receivedSatang: 50_000 })).toBe('draft')
  })
})

describe('parseBillingPeriodLabel — อ่านงวดกลับจากป้าย (ไฟล์ 20 ใช้หา `period_status_at_target`)', () => {
  it('อ่าน "มิถุนายน 2569" เป็นงวด 6/2569 (พ.ศ.)', () => {
    expect(parseBillingPeriodLabel('มิถุนายน 2569')).toEqual({ yearBe: 2569, month: 6 })
  })

  it('ไป-กลับกับ `billingPeriodLabel()` ได้ครบทุกเดือน', () => {
    for (let month = 0; month < 12; month += 1) {
      const label = billingPeriodLabel(new Date(Date.UTC(2026, month, 15)))
      expect(parseBillingPeriodLabel(label)).toEqual({ yearBe: 2569, month: month + 1 })
    }
  })

  it('รูปแบบที่อ่านไม่ออกคืน null (ผู้เรียกตัดสินใจต่อ ไม่ใช่เดา)', () => {
    expect(parseBillingPeriodLabel('June 2026')).toBeNull()
    expect(parseBillingPeriodLabel('มิถุนายน')).toBeNull()
    expect(parseBillingPeriodLabel('')).toBeNull()
  })
})

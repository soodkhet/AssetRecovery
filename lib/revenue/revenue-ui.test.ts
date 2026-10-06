import { describe, expect, it } from 'vitest'
import type { BillingBatchStatus } from '@/lib/generated/prisma/enums'
import {
  billingBatchVatLabel,
  revenueVatLabel,
  BILLING_STATUS_FILTERS,
  BILLING_STATUS_LABEL,
  billingStatusBadgeGroup,
  billingStatusView,
  DEBIT_NOTE_OUTSTANDING_LABEL,
  hasDebitNoteOutstanding,
  canDeleteBillingBatch,
  canSendBillingBatch,
  isArOutstanding,
  isArOverdue,
  customerWhtSummary,
  REVENUE_STATUS_FILTERS,
  REVENUE_STATUS_LABEL,
  revenueStatusBadgeGroup,
  totalArOutstandingSatang,
  VAT_MODE_LABEL,
} from '@/lib/revenue/revenue-ui'

/** ป้าย/ปุ่ม/สีของแท็บรายได้และวางบิล (`19` §8) — ยามไม่ให้หน้าจอ if สถานะเอง */

const STATUSES: readonly BillingBatchStatus[] = ['draft', 'sent', 'partially_paid', 'paid']

function batch(status: BillingBatchStatus, outstandingSatang: number, daysOverdue = 0) {
  return { status, outstandingSatang, daysOverdue }
}

describe('ป้ายกำกับครบทุกค่า enum', () => {
  it('สถานะรอบวางบิล 4 ค่า มีทั้งป้ายและกลุ่มสี', () => {
    for (const status of STATUSES) {
      expect(BILLING_STATUS_LABEL[status].length).toBeGreaterThan(0)
      expect(billingStatusBadgeGroup(status)).toBeTruthy()
    }
  })

  it('สถานะรายได้ 2 ค่า + VAT mode 3 ค่า มีป้ายครบ', () => {
    expect(REVENUE_STATUS_LABEL.ready_for_billing).toBe('รอวางบิล')
    expect(revenueStatusBadgeGroup('billed')).toBe('sent')
    expect(Object.keys(VAT_MODE_LABEL)).toEqual(['include_vat', 'exclude_vat', 'no_vat'])
  })

  it('ตัวกรองมีตัวเลือก "ทุกสถานะ" นำหน้าเสมอ และค่าตรงกับ enum', () => {
    expect(BILLING_STATUS_FILTERS[0]?.value).toBe('all')
    expect(BILLING_STATUS_FILTERS.slice(1).map((item) => item.value)).toEqual(STATUSES)
    expect(REVENUE_STATUS_FILTERS.slice(1).map((item) => item.value)).toEqual(['ready_for_billing', 'billed'])
  })
})

describe('ปุ่มบนแถวตรงกับ state machine ของ API (`23` §6.8)', () => {
  it('ส่งบิลได้เฉพาะรอบ draft', () => {
    expect(canSendBillingBatch('draft')).toBe(true)
    for (const status of ['sent', 'partially_paid', 'paid'] as const) {
      expect(canSendBillingBatch(status)).toBe(false)
    }
  })

  it('ลบได้เฉพาะรอบ draft (`19` §10)', () => {
    expect(canDeleteBillingBatch('draft')).toBe(true)
    for (const status of ['sent', 'partially_paid', 'paid'] as const) {
      expect(canDeleteBillingBatch(status)).toBe(false)
    }
  })
})

describe('AR แดงเมื่อ > 0 (`19` §8)', () => {
  it('ยอดค้าง > 0 ของรอบที่ส่งแล้ว = แดง', () => {
    expect(isArOutstanding(batch('sent', 500_00))).toBe(true)
    expect(isArOutstanding(batch('partially_paid', 1))).toBe(true)
  })

  it('ยอดค้าง 0 หรือติดลบ (รับเกิน) = ไม่แดง', () => {
    expect(isArOutstanding(batch('paid', 0))).toBe(false)
    expect(isArOutstanding(batch('paid', -100))).toBe(false)
  })

  it('รอบ draft ยังไม่ใช่ลูกหนี้ แม้ยอดค้างเต็มจำนวน', () => {
    expect(isArOutstanding(batch('draft', 999_00))).toBe(false)
  })

  it('เกินกำหนดต้องมีทั้งยอดค้างและ daysOverdue > 0', () => {
    expect(isArOverdue(batch('sent', 100_00, 5))).toBe(true)
    expect(isArOverdue(batch('sent', 100_00, 0))).toBe(false)
    expect(isArOverdue(batch('sent', 100_00, -3))).toBe(false)
    expect(isArOverdue(batch('draft', 100_00, 9))).toBe(false)
  })

  it('ยอดค้างรวมนับเฉพาะรอบที่เป็นลูกหนี้จริง', () => {
    const rows = [batch('sent', 300_00), batch('draft', 900_00), batch('paid', 0), batch('partially_paid', 50_00)]
    expect(totalArOutstandingSatang(rows)).toBe(350_00)
  })
})

describe('ป้าย VAT อ่านจาก snapshot (มติ PO 03/10/2569 — UAT Q6, BUG-015)', () => {
  it('รายได้: โหมด + อัตราที่ snapshot ไว้ · no_vat ไม่แสดงอัตรา', () => {
    expect(revenueVatLabel({ vatModeSnapshot: 'exclude_vat', vatRatePctUsed: 7 })).toBe('Exclude VAT 7.00%')
    expect(revenueVatLabel({ vatModeSnapshot: 'include_vat', vatRatePctUsed: 7 })).toBe('Include VAT 7.00%')
    expect(revenueVatLabel({ vatModeSnapshot: 'no_vat', vatRatePctUsed: 0 })).toBe('ไม่มี VAT')
  })

  it('รอบวางบิล: รวมโหมดของรายได้ในรอบ (ปกติค่าเดียว)', () => {
    expect(billingBatchVatLabel({ vatModes: ['exclude_vat'] })).toBe('Exclude VAT')
    expect(billingBatchVatLabel({ vatModes: ['exclude_vat', 'include_vat'] })).toBe('Exclude VAT / Include VAT')
    expect(billingBatchVatLabel({ vatModes: [] })).toBe('—')
  })
})

describe('BUG-165 — ภาษีที่ลูกค้าจะหัก (ประมาณ) + ยอดที่คาดว่าจะได้รับ', () => {
  it('รอบร่าง: ป้าย "ประมาณ" + อัตรา + ยอดที่คาดว่าจะได้รับ', () => {
    expect(
      customerWhtSummary({ customerWhtSatang: 3_000, customerWhtIsEstimate: true, customerWhtPct: 3, expectedReceiptSatang: 104_000 }),
    ).toEqual({
      label: 'ภาษีที่ลูกค้าจะหัก ณ ที่จ่าย (ประมาณ 3.00%)',
      whtText: '฿30.00',
      expectedLabel: 'ยอดที่คาดว่าจะได้รับ',
      expectedText: '฿1,040.00',
    })
  })

  it('บันทึกยอดหักจริงแล้ว ⇒ ไม่มีคำว่าประมาณ · บริษัทไม่หัก ⇒ ไม่แสดง', () => {
    expect(
      customerWhtSummary({ customerWhtSatang: 3_000, customerWhtIsEstimate: false, customerWhtPct: 3, expectedReceiptSatang: 104_000 })
        ?.label,
    ).toBe('ภาษีที่ลูกค้าหัก ณ ที่จ่าย')
    expect(
      customerWhtSummary({ customerWhtSatang: 0, customerWhtIsEstimate: true, customerWhtPct: null, expectedReceiptSatang: 107_000 }),
    ).toBeNull()
  })
})

describe('มติ O74 — ป้ายสถานะรอบสะท้อนยอดตามเอกสาร (ใบเพิ่มหนี้หลังรับชำระครบ)', () => {
  it('paid + ค้าง 107.00 ⇒ แสดง "รับชำระบางส่วน" + ป้ายเสริม · สถานะใน DB ไม่ถูกเปลี่ยน', () => {
    expect(billingStatusView('paid', 10_700)).toEqual({
      displayStatus: 'partially_paid',
      label: BILLING_STATUS_LABEL.partially_paid,
      group: 'partial',
      debitNoteOutstanding: true,
    })
    expect(DEBIT_NOTE_OUTSTANDING_LABEL).toBe('มีใบเพิ่มหนี้ค้าง')
  })

  it('paid ที่ไม่ค้าง/รับเกิน ⇒ "รับชำระครบ" ตามเดิม', () => {
    for (const outstanding of [0, -500]) {
      expect(billingStatusView('paid', outstanding)).toMatchObject({
        displayStatus: 'paid',
        label: BILLING_STATUS_LABEL.paid,
        debitNoteOutstanding: false,
      })
    }
  })

  it('สถานะอื่นคงป้ายเดิมเสมอ (ค้างอยู่แล้วโดยนิยาม)', () => {
    for (const status of ['draft', 'sent', 'partially_paid'] as const) {
      expect(billingStatusView(status, 10_700)).toMatchObject({
        displayStatus: status,
        label: BILLING_STATUS_LABEL[status],
        group: billingStatusBadgeGroup(status),
        debitNoteOutstanding: false,
      })
      expect(hasDebitNoteOutstanding(status, 10_700)).toBe(false)
    }
  })
})

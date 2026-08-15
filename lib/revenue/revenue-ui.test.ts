import { describe, expect, it } from 'vitest'
import type { BillingBatchStatus } from '@/lib/generated/prisma/enums'
import {
  BILLING_STATUS_FILTERS,
  BILLING_STATUS_LABEL,
  billingStatusBadgeGroup,
  canDeleteBillingBatch,
  canSendBillingBatch,
  isArOutstanding,
  isArOverdue,
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

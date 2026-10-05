import { describe, expect, it } from 'vitest'
import {
  billingBatchNumberYear,
  billingBatchRefLabel,
  formatBillingBatchNumber,
  isBillingBatchNumber,
  parseBillingBatchNumber,
} from '@/lib/revenue/billing-batch-number'

describe('เลขรอบวางบิล BL (มติ U76)', () => {
  it('ประกอบเลข พ.ศ. + ลำดับ 3 หลัก (เกิน 999 ยาวขึ้นเอง)', () => {
    expect(formatBillingBatchNumber(2569, 1)).toBe('BL-2569-001')
    expect(formatBillingBatchNumber(2569, 42)).toBe('BL-2569-042')
    expect(formatBillingBatchNumber(2570, 1000)).toBe('BL-2570-1000')
  })

  it('ปฏิเสธปี ค.ศ. และลำดับไม่ใช่จำนวนเต็มบวก', () => {
    expect(() => formatBillingBatchNumber(2026, 1)).toThrow(RangeError)
    expect(() => formatBillingBatchNumber(2569, 0)).toThrow(RangeError)
    expect(() => formatBillingBatchNumber(2569, 1.5)).toThrow(RangeError)
  })

  it('อ่านเลขกลับได้ · รูปแบบอื่น/ปี ค.ศ. = null', () => {
    expect(parseBillingBatchNumber('BL-2569-007')).toEqual({ beYear: 2569, sequence: 7 })
    expect(parseBillingBatchNumber('BL-2569-1001')).toEqual({ beYear: 2569, sequence: 1001 })
    expect(parseBillingBatchNumber('BL-2026-001')).toBeNull()
    expect(parseBillingBatchNumber('BB-2569-06')).toBeNull()
    expect(parseBillingBatchNumber('BL-2569-01')).toBeNull()
    expect(isBillingBatchNumber('BL-2569-001')).toBe(true)
    expect(isBillingBatchNumber('')).toBe(false)
  })

  it('ปีของเลขตามเวลาไทย — 31 ธ.ค. 17:30 UTC = 1 ม.ค. ปีใหม่แล้ว', () => {
    expect(billingBatchNumberYear(new Date('2026-12-31T16:59:59Z'))).toBe(2569)
    expect(billingBatchNumberYear(new Date('2026-12-31T17:30:00Z'))).toBe(2570)
    expect(() => billingBatchNumberYear(new Date('invalid'))).toThrow()
  })

  it('ป้ายอ้างอิงรอบ = เลข · งวด', () => {
    expect(billingBatchRefLabel({ batchNumber: 'BL-2569-001', period: 'มิถุนายน 2569' })).toBe('BL-2569-001 · มิถุนายน 2569')
  })
})

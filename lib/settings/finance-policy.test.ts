import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AR_AGING_BUCKETS,
  DEFAULT_WRITE_OFF_TOLERANCE_SATANG,
  MAX_AGING_BUCKETS,
  describeAgingBuckets,
  isAgingBucketsValid,
  normalizeFinancePolicyValues,
  toFinancePolicyAuditPayload,
  type FinancePolicyValues,
} from '@/lib/settings/finance-policy'

/** `13` §6.2.1 (DEC-006/D1) — 1 record ต่อองค์กร · ค่าทั้งชุดกระทบเงิน ⇒ reason บังคับ */

const base: FinancePolicyValues = {
  advanceMaxAmountPerRequestSatang: 500_000,
  requirePayeeIdDocument: false,
  arAgingBuckets: [90, 30, 60, 30],
  writeOffToleranceSatang: DEFAULT_WRITE_OFF_TOLERANCE_SATANG,
  advanceUnclearedToEmployeeReceivable: true,
}

describe('ค่าเริ่มต้น', () => {
  it('ช่วงอายุหนี้มาตรฐาน [30,60,90] (`13` §6.2.1)', () => {
    expect([...DEFAULT_AR_AGING_BUCKETS]).toEqual([30, 60, 90])
  })

  it('เพดานตัดส่วนต่างค่าธรรมเนียม 50 บาท = 5,000 สตางค์ (B4)', () => {
    expect(DEFAULT_WRITE_OFF_TOLERANCE_SATANG).toBe(5_000)
  })
})

describe('normalizeFinancePolicyValues', () => {
  it('เรียงช่วงอายุหนี้น้อย→มาก และตัดค่าซ้ำ', () => {
    expect(normalizeFinancePolicyValues(base).arAgingBuckets).toEqual([30, 60, 90])
  })

  it('เพดาน null (ไม่จำกัด) คงเป็น null — ไฟล์ 15 ตีความว่าไม่บังคับ', () => {
    expect(
      normalizeFinancePolicyValues({ ...base, advanceMaxAmountPerRequestSatang: null }).advanceMaxAmountPerRequestSatang,
    ).toBeNull()
  })
})

describe('isAgingBucketsValid', () => {
  it('ชุดมาตรฐานผ่าน', () => {
    expect(isAgingBucketsValid([30, 60, 90])).toBe(true)
  })

  it('ว่าง / เกินจำนวนช่วง = ไม่ผ่าน', () => {
    expect(isAgingBucketsValid([])).toBe(false)
    expect(isAgingBucketsValid(Array.from({ length: MAX_AGING_BUCKETS + 1 }, (_, i) => i + 1))).toBe(false)
  })

  it('ซ้ำ / ติดลบ / ศูนย์ / ทศนิยม = ไม่ผ่าน', () => {
    expect(isAgingBucketsValid([30, 30])).toBe(false)
    expect(isAgingBucketsValid([-1])).toBe(false)
    expect(isAgingBucketsValid([0])).toBe(false)
    expect(isAgingBucketsValid([30.5])).toBe(false)
  })

  it('ค่ามากเกินจริง = ไม่ผ่าน', () => {
    expect(isAgingBucketsValid([99_999])).toBe(false)
  })
})

describe('describeAgingBuckets', () => {
  it('สร้างช่วง 0-30/31-60/61-90/90+ ตาม `13` §6.2.1', () => {
    expect(describeAgingBuckets([30, 60, 90])).toEqual(['0-30 วัน', '31-60 วัน', '61-90 วัน', '90+ วัน'])
  })

  it('ช่วงเดียวก็ได้ 2 label', () => {
    expect(describeAgingBuckets([45])).toEqual(['0-45 วัน', '45+ วัน'])
  })

  it('ค่าที่ยังไม่เรียงถูก normalize ให้ก่อน', () => {
    expect(describeAgingBuckets([60, 30])).toEqual(['0-30 วัน', '31-60 วัน', '60+ วัน'])
  })

  it('ว่าง = ไม่มี label', () => {
    expect(describeAgingBuckets([])).toEqual([])
  })
})

describe('toFinancePolicyAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case ตามตารางจริง', () => {
    expect(toFinancePolicyAuditPayload(normalizeFinancePolicyValues(base))).toEqual({
      advance_max_amount_per_request_satang: 500_000,
      require_payee_id_document: false,
      ar_aging_buckets: [30, 60, 90],
      write_off_tolerance_satang: 5_000,
      advance_uncleared_to_employee_receivable: true,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { serviceFeeTemplateCreateSchema } from '@/lib/service-fee/schemas'

/**
 * Conditional validation ครบทุก model ตามตาราง `12` §7.1 (DoD ของ Phase 1.7)
 * เทสต์ชุดนี้แดง = ฟอร์ม/route ยอมให้สร้างเทมเพลตที่คำนวณรายได้ไม่ได้จริง
 */

const BASE = { chargePerTrackingRound: true, reason: 'ตั้งค่าตามสัญญาฉบับใหม่' }

const SUCCESS_FEE = {
  ...BASE,
  name: 'Standard Success Fee 10%',
  model: 'SUCCESS_FEE' as const,
  baseSatang: 0,
  ratePct: 10,
  basis: 'debt_amount' as const,
  chargeOnFail: false,
}

const FLAT = {
  ...BASE,
  name: 'Flat 3,000',
  model: 'FLAT' as const,
  baseSatang: 300_000,
  ratePct: 0,
  basis: null,
  chargeOnFail: true,
}

const HYBRID = {
  ...BASE,
  name: 'Hybrid 2,000 + 5%',
  model: 'HYBRID' as const,
  baseSatang: 200_000,
  ratePct: 5,
  basis: 'asset_value' as const,
  chargeOnFail: false,
}

function fieldsOf(input: unknown): string[] {
  const parsed = serviceFeeTemplateCreateSchema.safeParse(input)
  if (parsed.success) return []
  return parsed.error.issues.map((issue) => issue.path.join('.'))
}

describe('model SUCCESS_FEE (`12` §6.1/§7.1)', () => {
  it('ค่าครบถูกต้องผ่าน', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse(SUCCESS_FEE).success).toBe(true)
  })

  it('มี base ไม่ได้ (ต้องเป็น 0)', () => {
    expect(fieldsOf({ ...SUCCESS_FEE, baseSatang: 100_000 })).toContain('baseSatang')
  })

  it('ต้องมี rate', () => {
    expect(fieldsOf({ ...SUCCESS_FEE, ratePct: 0 })).toContain('ratePct')
  })

  it('ต้องเลือก basis', () => {
    expect(fieldsOf({ ...SUCCESS_FEE, basis: null })).toContain('basis')
  })

  it('ตั้ง charge_on_fail ไม่ได้ (เก็บเฉพาะเคสสำเร็จโดยนิยาม)', () => {
    expect(fieldsOf({ ...SUCCESS_FEE, chargeOnFail: true })).toContain('chargeOnFail')
  })
})

describe('model FLAT (`12` §6.2/§7.1)', () => {
  it('ค่าครบถูกต้องผ่าน — charge_on_fail ตั้งได้ทั้ง true/false', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse(FLAT).success).toBe(true)
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...FLAT, chargeOnFail: false }).success).toBe(true)
  })

  it('ต้องมี base', () => {
    expect(fieldsOf({ ...FLAT, baseSatang: 0 })).toContain('baseSatang')
  })

  it('มี rate ไม่ได้', () => {
    expect(fieldsOf({ ...FLAT, ratePct: 5 })).toContain('ratePct')
  })

  it('มี basis ไม่ได้', () => {
    expect(fieldsOf({ ...FLAT, basis: 'debt_amount' })).toContain('basis')
  })
})

describe('model HYBRID (`12` §6.3/§7.1)', () => {
  it('ค่าครบถูกต้องผ่าน', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse(HYBRID).success).toBe(true)
  })

  it('ต้องมีทั้ง base และ rate + basis', () => {
    expect(fieldsOf({ ...HYBRID, baseSatang: 0 })).toContain('baseSatang')
    expect(fieldsOf({ ...HYBRID, ratePct: 0 })).toContain('ratePct')
    expect(fieldsOf({ ...HYBRID, basis: null })).toContain('basis')
  })

  it('charge_on_fail ตั้งได้ทั้งสองค่า', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...HYBRID, chargeOnFail: true }).success).toBe(true)
  })
})

describe('กติกาเงินและเหตุผล', () => {
  it('base เป็นทศนิยม (บาท) ถูกปฏิเสธ — ต้องเป็นสตางค์จำนวนเต็ม (Rule 01)', () => {
    expect(fieldsOf({ ...FLAT, baseSatang: 3000.5 })).toContain('baseSatang')
  })

  it('rate ทศนิยมเกิน 2 ตำแหน่งถูกปฏิเสธ (NUMERIC(5,2))', () => {
    expect(fieldsOf({ ...SUCCESS_FEE, ratePct: 10.005 })).toContain('ratePct')
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...SUCCESS_FEE, ratePct: 10.25 }).success).toBe(true)
  })

  it('rate นอกช่วง 0-100 ไม่ถูกดักที่ schema — ใช้ code INVALID_RATE_RANGE แทน (`24` §6.1)', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...SUCCESS_FEE, ratePct: 150 }).success).toBe(true)
  })

  it('reason บังคับทุก mutation (`12` §13 — กระทบรายได้)', () => {
    expect(fieldsOf({ ...FLAT, reason: '' })).toContain('reason')
  })
})

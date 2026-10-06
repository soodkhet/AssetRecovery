import { describe, expect, it } from 'vitest'
import { serviceFeeTemplateCreateSchema } from '@/lib/service-fee/schemas'

/**
 * Conditional validation ครบทุก model ตามตาราง `12` §7.1 (DoD ของ Phase 1.7)
 * เทสต์ชุดนี้แดง = ฟอร์ม/route ยอมให้สร้างเทมเพลตที่คำนวณรายได้ไม่ได้จริง
 */

const BASE = { reason: 'ตั้งค่าตามสัญญาฉบับใหม่' }

const SUCCESS_FEE = {
  ...BASE,
  name: 'Standard Success Fee 10%',
  model: 'SUCCESS_FEE' as const,
  baseSatang: 0,
  ratePct: 10,
  basis: 'debt_amount' as const,
  failFeeSatang: null,
}

const FLAT = {
  ...BASE,
  name: 'Flat 3,000',
  model: 'FLAT' as const,
  baseSatang: 300_000,
  ratePct: 0,
  basis: null,
  failFeeSatang: 300_000,
}

const HYBRID = {
  ...BASE,
  name: 'Hybrid 2,000 + 5%',
  model: 'HYBRID' as const,
  baseSatang: 200_000,
  ratePct: 5,
  basis: 'debt_amount' as const,
  failFeeSatang: null,
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

  it('ฐานมูลค่าเครื่อง (asset_value) ถูกตัดออกแล้ว — รับเฉพาะยอดหนี้คงเหลือ (มติ PO U126)', () => {
    expect(fieldsOf({ ...SUCCESS_FEE, basis: 'asset_value' })).toContain('basis')
  })

  it('ไม่มีสวิตช์คิดต่อรอบแล้ว — ค่าเก่าที่ส่งมาถูกตัดทิ้ง ไม่ไปถึงชั้นบันทึก (มติ PO U125)', () => {
    const parsed = serviceFeeTemplateCreateSchema.parse({ ...SUCCESS_FEE, chargePerTrackingRound: false })
    expect(parsed).not.toHaveProperty('chargePerTrackingRound')
  })

  it('มติ U165: ตั้งยอดกรณีไม่สำเร็จได้ทุกโมเดล รวม SUCCESS_FEE', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...SUCCESS_FEE, failFeeSatang: 30_000 }).success).toBe(true)
  })

  it('มติ U165: request เก่าที่ส่ง chargeOnFail มาแทน failFeeSatang → ปฏิเสธ (ไม่เงียบตัดทิ้ง)', () => {
    const { failFeeSatang: _drop, ...legacy } = SUCCESS_FEE
    void _drop
    expect(fieldsOf({ ...legacy, chargeOnFail: true })).toContain('failFeeSatang')
  })

  it('chargeOnFail ที่หลุดมาพร้อม failFeeSatang ถูกตัดทิ้ง ไม่ไปถึงชั้นบันทึก', () => {
    const parsed = serviceFeeTemplateCreateSchema.parse({ ...SUCCESS_FEE, chargeOnFail: true })
    expect(parsed).not.toHaveProperty('chargeOnFail')
  })
})

describe('model FLAT (`12` §6.2/§7.1)', () => {
  it('ค่าครบถูกต้องผ่าน — ยอดกรณีไม่สำเร็จเป็น null (ไม่เก็บ) หรือยอดแยกได้', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse(FLAT).success).toBe(true)
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...FLAT, failFeeSatang: null }).success).toBe(true)
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...FLAT, baseSatang: 150_000, failFeeSatang: 30_000 }).success).toBe(
      true,
    )
  })

  it('ติ๊กเรียกเก็บกรณีไม่สำเร็จแล้วยอดต้อง > 0 · ติดลบ/ทศนิยมสตางค์ถูกปฏิเสธ', () => {
    expect(fieldsOf({ ...FLAT, failFeeSatang: 0 })).toContain('failFeeSatang')
    expect(fieldsOf({ ...FLAT, failFeeSatang: -100 })).toContain('failFeeSatang')
    expect(fieldsOf({ ...FLAT, failFeeSatang: 300.5 })).toContain('failFeeSatang')
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

  it('ยอดกรณีไม่สำเร็จตั้งได้', () => {
    expect(serviceFeeTemplateCreateSchema.safeParse({ ...HYBRID, failFeeSatang: 50_000 }).success).toBe(true)
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

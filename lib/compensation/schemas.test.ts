import { describe, expect, it } from 'vitest'
import { compensationPlanCreateSchema } from '@/lib/compensation/schemas'

/**
 * Conditional validation ของ Fuel Rule 2 โหมด (`11` §7.1 · §16 "Fuel mode toggle")
 * เทสต์ชุดนี้แดง = ฟอร์ม/route ปล่อยให้ตั้งค่าสองโหมดพร้อมกันได้ ซึ่งผิดสเปคไฟล์ 11
 */

const BASE = {
  name: 'แผนทีมอินเฮ้าส์',
  side: 'inhouse' as const,
  allowanceSatang: 30_000,
  commissionSatang: 50_000,
  noSuccessFeeSatang: 20_000,
  hotelMaxPerNightSatang: 80_000,
  hotelReceiptRequired: true,
  whtPct: 3,
  effectiveFrom: '2026-09-01',
  reason: 'ตั้งค่าแผนใหม่ตามมติที่ประชุม',
}

const PER_KM = {
  ...BASE,
  fuelMode: 'PER_KM' as const,
  fuelRatePerKmSatang: 700,
  fuelMaxPerCaseSatang: 100_000,
}

const DAILY_FLAT = { ...BASE, fuelMode: 'DAILY_FLAT' as const, fuelDailyFlatSatang: 40_000 }

function fieldsOf(input: unknown): string[] {
  const parsed = compensationPlanCreateSchema.safeParse(input)
  if (parsed.success) return []
  return parsed.error.issues.map((issue) => issue.path.join('.'))
}

describe('compensationPlanCreateSchema — โหมดค่าน้ำมัน (`11` §7.1)', () => {
  it('PER_KM ครบถ้วนผ่าน (เพดานต่อเคสตั้งได้)', () => {
    expect(compensationPlanCreateSchema.safeParse(PER_KM).success).toBe(true)
  })

  it('PER_KM ไม่ตั้งเพดานก็ผ่าน — null = ไม่จำกัด (`22` §6.1)', () => {
    expect(
      compensationPlanCreateSchema.safeParse({ ...PER_KM, fuelMaxPerCaseSatang: null }).success,
    ).toBe(true)
  })

  it('PER_KM ต้องมีอัตราต่อกิโลเมตร', () => {
    expect(fieldsOf({ ...PER_KM, fuelRatePerKmSatang: null })).toContain('fuelRatePerKmSatang')
    expect(fieldsOf({ ...PER_KM, fuelRatePerKmSatang: 0 })).toContain('fuelRatePerKmSatang')
  })

  it('PER_KM ตั้งค่าเหมาจ่ายรายวันพร้อมกันไม่ได้', () => {
    expect(fieldsOf({ ...PER_KM, fuelDailyFlatSatang: 40_000 })).toContain('fuelDailyFlatSatang')
  })

  it('DAILY_FLAT ครบถ้วนผ่าน', () => {
    expect(compensationPlanCreateSchema.safeParse(DAILY_FLAT).success).toBe(true)
  })

  it('DAILY_FLAT ต้องมีค่าเหมาจ่ายรายวัน', () => {
    expect(fieldsOf({ ...DAILY_FLAT, fuelDailyFlatSatang: null })).toContain('fuelDailyFlatSatang')
    expect(fieldsOf({ ...DAILY_FLAT, fuelDailyFlatSatang: 0 })).toContain('fuelDailyFlatSatang')
  })

  it('DAILY_FLAT ตั้งอัตราต่อกิโลเมตร/เพดานต่อเคสไม่ได้', () => {
    expect(fieldsOf({ ...DAILY_FLAT, fuelRatePerKmSatang: 700 })).toContain('fuelRatePerKmSatang')
    expect(fieldsOf({ ...DAILY_FLAT, fuelMaxPerCaseSatang: 100_000 })).toContain('fuelMaxPerCaseSatang')
  })
})

describe('compensationPlanCreateSchema — เงินและอัตรา (Rule 01)', () => {
  it('เงินเป็นทศนิยม (บาท) ถูกปฏิเสธ — ต้องส่งเป็นสตางค์จำนวนเต็ม', () => {
    expect(fieldsOf({ ...PER_KM, allowanceSatang: 300.5 })).toContain('allowanceSatang')
  })

  it('เงินติดลบถูกปฏิเสธ', () => {
    expect(fieldsOf({ ...PER_KM, commissionSatang: -1 })).toContain('commissionSatang')
  })

  it('commission กับ no_success_fee ตั้งพร้อมกันได้ — exclusive ที่ outcome ไม่ใช่ที่ template (`11` §9)', () => {
    const parsed = compensationPlanCreateSchema.safeParse({
      ...PER_KM,
      commissionSatang: 50_000,
      noSuccessFeeSatang: 20_000,
    })
    expect(parsed.success).toBe(true)
  })

  it('wht_pct นอกช่วง 0-100 ถูกปฏิเสธ', () => {
    expect(fieldsOf({ ...PER_KM, whtPct: 101 })).toContain('whtPct')
    expect(fieldsOf({ ...PER_KM, whtPct: -1 })).toContain('whtPct')
  })

  it('wht_pct ทศนิยมเกิน 2 ตำแหน่งถูกปฏิเสธ (NUMERIC(5,2))', () => {
    expect(fieldsOf({ ...PER_KM, whtPct: 3.005 })).toContain('whtPct')
    expect(compensationPlanCreateSchema.safeParse({ ...PER_KM, whtPct: 1.5 }).success).toBe(true)
  })

  it('reason สั้นเกินไปถูกปฏิเสธ (`90` §13 — หมวดเงิน)', () => {
    expect(fieldsOf({ ...PER_KM, reason: 'ok' })).toContain('reason')
  })

  it('effective_from ต้องเป็น ISO ค.ศ. (`<input type="date">` — DEC-005)', () => {
    expect(fieldsOf({ ...PER_KM, effectiveFrom: '01/09/2569' })).toContain('effectiveFrom')
  })
})

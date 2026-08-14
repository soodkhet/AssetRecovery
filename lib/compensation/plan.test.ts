import { describe, expect, it } from 'vitest'
import {
  describeFuelRule,
  diffPlanValues,
  normalizePlanValues,
  pickCurrentPlanVersion,
  planNextVersion,
  resolvePlanVersionAt,
  toCompensationSnapshot,
  type CompensationPlanValues,
  type CompensationPlanVersion,
} from '@/lib/compensation/plan'

const VALUES: CompensationPlanValues = {
  name: 'แผนทีมอินเฮ้าส์',
  side: 'inhouse',
  fuelMode: 'PER_KM',
  fuelRatePerKmSatang: 700,
  fuelMaxPerCaseSatang: 100_000,
  fuelDailyFlatSatang: null,
  allowanceSatang: 30_000,
  commissionSatang: 50_000,
  noSuccessFeeSatang: 20_000,
  hotelMaxPerNightSatang: 80_000,
  hotelReceiptRequired: true,
  whtPct: 3,
  effectiveFrom: '2026-09-01',
}

const V1: CompensationPlanVersion = { ...VALUES, id: 'plan-1', version: 1, effectiveTo: null, isCurrent: true }

describe('normalizePlanValues (`11` §7.1)', () => {
  it('PER_KM ล้างค่าเหมาจ่ายรายวันทิ้ง', () => {
    const result = normalizePlanValues({ ...VALUES, fuelDailyFlatSatang: 40_000 })
    expect(result.fuelDailyFlatSatang).toBeNull()
    expect(result.fuelRatePerKmSatang).toBe(700)
  })

  it('DAILY_FLAT ล้างอัตราต่อกิโลเมตรและเพดานต่อเคสทิ้ง', () => {
    const result = normalizePlanValues({ ...VALUES, fuelMode: 'DAILY_FLAT', fuelDailyFlatSatang: 40_000 })
    expect(result.fuelRatePerKmSatang).toBeNull()
    expect(result.fuelMaxPerCaseSatang).toBeNull()
    expect(result.fuelDailyFlatSatang).toBe(40_000)
  })
})

describe('planNextVersion (`11` §10/§14 — แก้แล้วต้องขึ้นเวอร์ชัน ไม่ overwrite)', () => {
  it('ค่าเหมือนเดิมทุกช่อง → ไม่ขึ้นเวอร์ชันใหม่', () => {
    expect(planNextVersion(V1, { ...VALUES })).toBeNull()
  })

  it('แก้ค่าคอมมิชชั่น → เวอร์ชัน +1 พร้อมรายชื่อฟิลด์ที่เปลี่ยน', () => {
    const next = planNextVersion(V1, { ...VALUES, commissionSatang: 60_000, effectiveFrom: '2026-10-01' })
    expect(next?.version).toBe(2)
    expect(next?.changedFields).toEqual(['commissionSatang', 'effectiveFrom'])
  })

  it('ปิดช่วงเวอร์ชันเดิมที่วันก่อนหน้าเวอร์ชันใหม่เริ่มมีผล', () => {
    const next = planNextVersion(V1, { ...VALUES, allowanceSatang: 35_000, effectiveFrom: '2026-10-01' })
    expect(next?.previousEffectiveTo).toBe('2026-09-30')
  })

  it('เวอร์ชันใหม่เริ่มวันเดียวกับของเดิม → ไม่มีช่วงให้ปิด (ใช้ is_current ตัดสิน)', () => {
    const next = planNextVersion(V1, { ...VALUES, allowanceSatang: 35_000 })
    expect(next?.previousEffectiveTo).toBeNull()
  })

  it('สลับโหมดน้ำมันแล้วค่าโหมดเดิมถูกล้าง (normalize) ก่อนเทียบ', () => {
    const next = planNextVersion(V1, {
      ...VALUES,
      fuelMode: 'DAILY_FLAT',
      fuelDailyFlatSatang: 40_000,
    })
    expect(next?.values.fuelRatePerKmSatang).toBeNull()
    expect(next?.values.fuelMaxPerCaseSatang).toBeNull()
    expect(next?.changedFields).toContain('fuelMode')
  })
})

describe('diffPlanValues', () => {
  it('ค่าที่ต่างกันเฉพาะฟิลด์ของโหมดที่ไม่ได้ใช้ ไม่นับว่าเปลี่ยน', () => {
    expect(diffPlanValues(V1, { ...VALUES, fuelDailyFlatSatang: 99_999 })).toEqual([])
  })
})

describe('resolvePlanVersionAt — snapshot resolver (`92` §7.1)', () => {
  const v1: CompensationPlanVersion = {
    ...V1,
    version: 1,
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-09-30',
    isCurrent: false,
  }
  const v2: CompensationPlanVersion = {
    ...V1,
    id: 'plan-2',
    version: 2,
    commissionSatang: 60_000,
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
    isCurrent: true,
  }

  it('วันที่อยู่ในช่วงเวอร์ชันเก่า → ได้เวอร์ชันเก่า (ห้ามใช้ค่าปัจจุบันคำนวณย้อนหลัง)', () => {
    expect(resolvePlanVersionAt([v1, v2], '2026-09-15')?.version).toBe(1)
  })

  it('วันที่อยู่ในช่วงเวอร์ชันใหม่ → ได้เวอร์ชันใหม่', () => {
    expect(resolvePlanVersionAt([v1, v2], '2026-10-01')?.version).toBe(2)
  })

  it('วันที่ก่อนแผนเริ่มมีผล → ไม่มีเวอร์ชันที่ใช้ได้', () => {
    expect(resolvePlanVersionAt([v1, v2], '2025-12-31')).toBeNull()
  })

  it('pickCurrentPlanVersion คืนเวอร์ชันที่ is_current', () => {
    expect(pickCurrentPlanVersion([v1, v2])?.id).toBe('plan-2')
  })

  it('snapshot เก็บ id + version ของเวอร์ชันที่มีผล (`92` §7.1)', () => {
    expect(toCompensationSnapshot(v1)).toEqual({ compPlanId: 'plan-1', compPlanVersion: 1 })
  })
})

describe('describeFuelRule (UI — `11` §8)', () => {
  it('PER_KM คืนอัตราและเพดาน (null = ไม่จำกัด)', () => {
    expect(describeFuelRule({ ...VALUES, fuelMaxPerCaseSatang: null })).toEqual({
      mode: 'PER_KM',
      ratePerKmSatang: 700,
      maxPerCaseSatang: null,
    })
  })

  it('DAILY_FLAT คืนค่าเหมาจ่ายรายวัน', () => {
    expect(describeFuelRule({ ...VALUES, fuelMode: 'DAILY_FLAT', fuelDailyFlatSatang: 40_000 })).toEqual({
      mode: 'DAILY_FLAT',
      dailyFlatSatang: 40_000,
    })
  })
})

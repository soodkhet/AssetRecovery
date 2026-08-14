import { describe, expect, it } from 'vitest'
import { ServiceFeeError } from '@/lib/service-fee/errors'
import {
  assertRateRange,
  describeServiceFeeFormula,
  diffTemplateValues,
  normalizeTemplateValues,
  pickCurrentTemplateVersion,
  planNextTemplateVersion,
  toServiceFeeSnapshot,
  type ServiceFeeTemplateValues,
  type ServiceFeeTemplateVersion,
} from '@/lib/service-fee/template'

const SUCCESS_FEE: ServiceFeeTemplateValues = {
  name: 'Standard Success Fee 10%',
  model: 'SUCCESS_FEE',
  baseSatang: 0,
  ratePct: 10,
  basis: 'debt_amount',
  chargeOnFail: false,
  chargePerTrackingRound: true,
}

const FLAT: ServiceFeeTemplateValues = {
  name: 'Flat 3,000',
  model: 'FLAT',
  baseSatang: 300_000,
  ratePct: 0,
  basis: null,
  chargeOnFail: false,
  chargePerTrackingRound: true,
}

const HYBRID: ServiceFeeTemplateValues = {
  name: 'Hybrid 2,000 + 5%',
  model: 'HYBRID',
  baseSatang: 200_000,
  ratePct: 5,
  basis: 'asset_value',
  chargeOnFail: true,
  chargePerTrackingRound: true,
}

const V1: ServiceFeeTemplateVersion = { ...SUCCESS_FEE, id: 'tpl-1', version: 1, isCurrent: true }

describe('assertRateRange (`12` §11 · `24` §6.1)', () => {
  it('0-100 ผ่าน', () => {
    expect(() => assertRateRange(0)).not.toThrow()
    expect(() => assertRateRange(100)).not.toThrow()
  })

  it('เกินช่วงโยน INVALID_RATE_RANGE', () => {
    expect(() => assertRateRange(100.01)).toThrow(ServiceFeeError)
    try {
      assertRateRange(-1)
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect((error as ServiceFeeError).code).toBe('INVALID_RATE_RANGE')
      expect((error as ServiceFeeError).status).toBe(400)
    }
  })
})

describe('normalizeTemplateValues (`12` §7.1)', () => {
  it('SUCCESS_FEE ล้าง base และ charge_on_fail', () => {
    const result = normalizeTemplateValues({ ...SUCCESS_FEE, baseSatang: 500_000, chargeOnFail: true })
    expect(result.baseSatang).toBe(0)
    expect(result.chargeOnFail).toBe(false)
  })

  it('FLAT ล้าง rate และ basis', () => {
    const result = normalizeTemplateValues({ ...FLAT, ratePct: 5, basis: 'debt_amount' })
    expect(result.ratePct).toBe(0)
    expect(result.basis).toBeNull()
  })

  it('HYBRID เก็บค่าครบทุกช่อง', () => {
    expect(normalizeTemplateValues(HYBRID)).toEqual(HYBRID)
  })
})

describe('describeServiceFeeFormula — สูตร 2 กรณี (`22` §6.5–6.7 · DEC-008)', () => {
  it('SUCCESS_FEE: สำเร็จ = rate × basis / ไม่สำเร็จ = ไม่เรียกเก็บ (`12` §16)', () => {
    expect(describeServiceFeeFormula(SUCCESS_FEE)).toEqual({
      onSuccess: { kind: 'rate', ratePct: 10, basis: 'debt_amount' },
      onFail: { kind: 'none' },
    })
  })

  it('FLAT + charge_on_fail=true: เรียกเก็บ base ทั้งสองกรณี', () => {
    expect(describeServiceFeeFormula({ ...FLAT, chargeOnFail: true })).toEqual({
      onSuccess: { kind: 'flat', baseSatang: 300_000 },
      onFail: { kind: 'flat', baseSatang: 300_000 },
    })
  })

  it('FLAT + charge_on_fail=false: เคสไม่สำเร็จไม่เรียกเก็บ', () => {
    expect(describeServiceFeeFormula(FLAT).onFail).toEqual({ kind: 'none' })
  })

  it('HYBRID สำเร็จ = base + rate × basis · ไม่สำเร็จ = base เมื่อ charge_on_fail', () => {
    expect(describeServiceFeeFormula(HYBRID)).toEqual({
      onSuccess: { kind: 'hybrid', baseSatang: 200_000, ratePct: 5, basis: 'asset_value' },
      onFail: { kind: 'flat', baseSatang: 200_000 },
    })
  })

  it('HYBRID + charge_on_fail=false: ไม่สำเร็จไม่เรียกเก็บ ส่วน rate ยังผูกกับความสำเร็จเสมอ', () => {
    expect(describeServiceFeeFormula({ ...HYBRID, chargeOnFail: false }).onFail).toEqual({ kind: 'none' })
  })
})

describe('planNextTemplateVersion (`12` §9)', () => {
  it('ค่าเหมือนเดิม → ไม่ขึ้นเวอร์ชันใหม่', () => {
    expect(planNextTemplateVersion(V1, { ...SUCCESS_FEE })).toBeNull()
  })

  it('แก้อัตรา → เวอร์ชัน +1', () => {
    const next = planNextTemplateVersion(V1, { ...SUCCESS_FEE, ratePct: 12 })
    expect(next?.version).toBe(2)
    expect(next?.changedFields).toEqual(['ratePct'])
  })

  it('เปลี่ยน model แล้วค่าที่ไม่เกี่ยวถูก normalize ก่อนเก็บ', () => {
    const next = planNextTemplateVersion(V1, { ...FLAT, name: SUCCESS_FEE.name })
    expect(next?.values.ratePct).toBe(0)
    expect(next?.values.basis).toBeNull()
    expect(next?.changedFields).toContain('model')
  })

  it('ค่าที่ต่างกันเฉพาะฟิลด์ที่ model ไม่ใช้ ไม่นับว่าเปลี่ยน', () => {
    expect(diffTemplateValues(V1, { ...SUCCESS_FEE, baseSatang: 999_999 })).toEqual([])
  })
})

describe('snapshot (`10` §9.2 · `92` §7.1)', () => {
  it('เก็บ id + version + ค่าที่ normalize แล้ว', () => {
    expect(toServiceFeeSnapshot({ ...V1, baseSatang: 999, chargeOnFail: true })).toEqual({
      serviceFeeTemplateId: 'tpl-1',
      serviceFeeTemplateVersion: 1,
      model: 'SUCCESS_FEE',
      baseSatang: 0,
      ratePct: 10,
      basis: 'debt_amount',
      chargeOnFail: false,
      chargePerTrackingRound: true,
    })
  })

  it('pickCurrentTemplateVersion คืนเวอร์ชันที่ is_current', () => {
    const v2: ServiceFeeTemplateVersion = { ...V1, id: 'tpl-2', version: 2, isCurrent: true }
    expect(pickCurrentTemplateVersion([{ ...V1, isCurrent: false }, v2])?.id).toBe('tpl-2')
  })
})

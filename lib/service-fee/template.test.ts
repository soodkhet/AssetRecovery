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
  failFeeSatang: null,
}

const FLAT: ServiceFeeTemplateValues = {
  name: 'Flat 3,000',
  model: 'FLAT',
  baseSatang: 300_000,
  ratePct: 0,
  basis: null,
  failFeeSatang: null,
}

const HYBRID: ServiceFeeTemplateValues = {
  name: 'Hybrid 2,000 + 5%',
  model: 'HYBRID',
  baseSatang: 200_000,
  ratePct: 5,
  basis: 'debt_amount',
  failFeeSatang: 200_000,
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
  it('SUCCESS_FEE ล้าง base แต่คงยอดกรณีไม่สำเร็จ (มติ U165 ใช้ได้ทุกโมเดล)', () => {
    const result = normalizeTemplateValues({ ...SUCCESS_FEE, baseSatang: 500_000, failFeeSatang: 30_000 })
    expect(result.baseSatang).toBe(0)
    expect(result.failFeeSatang).toBe(30_000)
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

  it('SUCCESS_FEE + ยอดกรณีไม่สำเร็จ: ไม่สำเร็จ = ยอดแยก', () => {
    expect(describeServiceFeeFormula({ ...SUCCESS_FEE, failFeeSatang: 30_000 }).onFail).toEqual({
      kind: 'flat',
      baseSatang: 30_000,
    })
  })

  it('FLAT สำเร็จ 1,500 / ไม่สำเร็จ 300 (ตัวอย่างมติ U165)', () => {
    expect(describeServiceFeeFormula({ ...FLAT, baseSatang: 150_000, failFeeSatang: 30_000 })).toEqual({
      onSuccess: { kind: 'flat', baseSatang: 150_000 },
      onFail: { kind: 'flat', baseSatang: 30_000 },
    })
  })

  it('FLAT ไม่เก็บกรณีไม่สำเร็จ: เคสไม่สำเร็จไม่เรียกเก็บ', () => {
    expect(describeServiceFeeFormula(FLAT).onFail).toEqual({ kind: 'none' })
  })

  it('HYBRID สำเร็จ = base + rate × basis · ไม่สำเร็จ = ยอดกรณีไม่สำเร็จ', () => {
    expect(describeServiceFeeFormula(HYBRID)).toEqual({
      onSuccess: { kind: 'hybrid', baseSatang: 200_000, ratePct: 5, basis: 'debt_amount' },
      onFail: { kind: 'flat', baseSatang: 200_000 },
    })
  })

  it('HYBRID ไม่เก็บกรณีไม่สำเร็จ: ไม่สำเร็จไม่เรียกเก็บ ส่วน rate ยังผูกกับความสำเร็จเสมอ', () => {
    expect(describeServiceFeeFormula({ ...HYBRID, failFeeSatang: null }).onFail).toEqual({ kind: 'none' })
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
    expect(toServiceFeeSnapshot({ ...V1, baseSatang: 999, failFeeSatang: 30_000 })).toEqual({
      serviceFeeTemplateId: 'tpl-1',
      serviceFeeTemplateVersion: 1,
      model: 'SUCCESS_FEE',
      baseSatang: 0,
      ratePct: 10,
      basis: 'debt_amount',
      failFeeSatang: 30_000,
    })
  })

  it('pickCurrentTemplateVersion คืนเวอร์ชันที่ is_current', () => {
    const v2: ServiceFeeTemplateVersion = { ...V1, id: 'tpl-2', version: 2, isCurrent: true }
    expect(pickCurrentTemplateVersion([{ ...V1, isCurrent: false }, v2])?.id).toBe('tpl-2')
  })
})

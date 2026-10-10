import { describe, expect, it } from 'vitest'
import { monthToDateByPayee } from '@/lib/finance/wht-month-to-date'

describe('monthToDateByPayee (staging E-054)', () => {
  it('รวมฐานต่อผู้รับ · ยังไม่หัก = รายการภาษี 0 ลบฐานที่ยกไปหักแล้ว', () => {
    const result = monthToDateByPayee([
      { payeeId: 'a', grossSatang: 60_000, whtSatang: 0, whtCarriedBaseSatang: 0, whtCondition: 'withhold' },
      { payeeId: 'a', grossSatang: 50_000, whtSatang: 3_300, whtCarriedBaseSatang: 60_000, whtCondition: 'withhold' },
      { payeeId: 'a', grossSatang: 20_000, whtSatang: 0, whtCarriedBaseSatang: 0, whtCondition: null },
      { payeeId: 'b', grossSatang: 30_000, whtSatang: 0, whtCarriedBaseSatang: 0, whtCondition: 'withhold' },
    ])
    expect(result.get('a')).toEqual({ priorBaseSatang: 130_000, priorUnwithheldBaseSatang: 20_000 })
    expect(result.get('b')).toEqual({ priorBaseSatang: 30_000, priorUnwithheldBaseSatang: 30_000 })
  })

  it('เงื่อนไข (2) ผู้จ่ายออกภาษี — ฐาน = gross − ภาษีที่ออกให้', () => {
    const result = monthToDateByPayee([
      { payeeId: 'a', grossSatang: 103_093, whtSatang: 3_093, whtCarriedBaseSatang: 0, whtCondition: 'pay_always' },
    ])
    expect(result.get('a')?.priorBaseSatang).toBe(100_000)
  })
})

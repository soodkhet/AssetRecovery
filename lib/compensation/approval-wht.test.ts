import { describe, expect, it } from 'vitest'
import { approvalWhtPreview, WHT_402_RATE_MISSING_WARNING, type ApprovalWhtInput } from '@/lib/compensation/approval-wht'
import { DEFAULT_WHT_POLICY } from '@/lib/settings/wht-policy'

/** BUG-176 — คิวอนุมัติต้องแสดง WHT/Net ด้วยสูตรเดียวกับรอบจ่าย (เงื่อนไข (1)/(2)/(3) · ฐาน · ประเภทเงินได้ · snapshot) */

function input(overrides: Partial<ApprovalWhtInput> = {}, payee: Partial<ApprovalWhtInput['payee']> = {}): ApprovalWhtInput {
  return {
    grossSatang: 1_234_567,
    expenseType: 'commission',
    planWhtPct: 3,
    policy: DEFAULT_WHT_POLICY,
    payoutItem: null,
    ...overrides,
    payee: {
      taxProfile: { whtPct: 3, whtBasis: 'before_vat', whtMinThresholdSatang: 100_000 },
      wht402Pct: null,
      whtCondition: 'withhold',
      payeeType: 'individual',
      side: 'inhouse',
      ...payee,
    },
  }
}

describe('approvalWhtPreview (BUG-176)', () => {
  it('(1) หัก ณ ที่จ่าย — Net = Gross − WHT', () => {
    const result = approvalWhtPreview(input())
    expect(result).toMatchObject({ whtSatang: 37_037, netSatang: 1_197_530, whtPayerBorne: false, whtFromPayout: false })
  })

  it('(3) ออกให้ครั้งเดียว — ภาษีที่บริษัทออกให้ ฿370.37 · ผู้รับได้เต็ม ฿12,345.67 (เคส UAT)', () => {
    const result = approvalWhtPreview(input({}, { whtCondition: 'pay_once' }))
    expect(result).toMatchObject({ whtSatang: 37_037, netSatang: 1_234_567, whtPayerBorne: true })
  })

  it('(2) ออกให้ตลอดไป — ภาษีทบยอด · ผู้รับได้เต็ม', () => {
    const result = approvalWhtPreview(input({}, { whtCondition: 'pay_always' }))
    // 1,234,567 × 3 ÷ 97 = 38,182.48… → 38,182
    expect(result).toMatchObject({ whtSatang: 38_182, netSatang: 1_234_567, whtPayerBorne: true })
  })

  it('ชนิดรายการนอกฐาน WHT ตามค่าตั้ง ⇒ ไม่หัก', () => {
    const result = approvalWhtPreview(input({ expenseType: 'hotel' }))
    expect(result).toMatchObject({ whtSatang: 0, netSatang: 1_234_567, whtWarning: null })
  })

  it('ประเภทเงินได้ 40(2) ใช้อัตรารายบุคคลไม่ใช่ Tax Profile', () => {
    const policy = { ...DEFAULT_WHT_POLICY, incomeTypeMode: 'all_40_2' as const }
    const result = approvalWhtPreview(input({ policy }, { wht402Pct: 5 }))
    expect(result).toMatchObject({ whtSatang: 61_728, netSatang: 1_172_839, whtPctUsed: 5 })
  })

  it('40(2) ยังไม่มีอัตรา ⇒ ไม่หัก + คำเตือน (ไม่ล้ม)', () => {
    const policy = { ...DEFAULT_WHT_POLICY, incomeTypeMode: 'all_40_2' as const }
    const result = approvalWhtPreview(input({ policy }))
    expect(result).toMatchObject({ whtSatang: 0, netSatang: 1_234_567, whtWarning: WHT_402_RATE_MISSING_WARNING })
  })

  it('เข้ารอบจ่ายแล้ว ⇒ ใช้ยอดที่บันทึกในรอบ ไม่คิดใหม่', () => {
    const result = approvalWhtPreview(
      input({
        payoutItem: { whtSatang: 37_037, netSatang: 1_234_567, whtPctSnapshot: 3, whtCondition: 'pay_once' },
      }),
    )
    expect(result).toMatchObject({
      whtSatang: 37_037,
      netSatang: 1_234_567,
      whtPayerBorne: true,
      whtFromPayout: true,
      whtWarning: null,
    })
  })

  it('ไม่มี Tax Profile ⇒ ตกไปใช้อัตราแผนพร้อมคำเตือน', () => {
    const result = approvalWhtPreview(input({}, { taxProfile: null }))
    expect(result.whtRateSource).toBe('plan')
    expect(result.whtWarning).not.toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  approvalWhtPreview,
  approvalWhtPreviews,
  approvalWhtPreviewsForNextBatch,
  WHT_402_RATE_MISSING_WARNING,
  WHT_RATE_MISSING_WARNING,
  type ApprovalWhtInput,
} from '@/lib/compensation/approval-wht'
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

  // มติ PO 06/10/2569 U121 — ผู้รับ 40(8) ไม่มี Tax Profile + รายการไม่มีแผน เคยทำทั้งหน้า 500
  it('ไม่มี Tax Profile + รายการไม่มีแผน (ในฐาน) ⇒ คำเตือนต่อแถว ไม่ throw · ภาษี 0', () => {
    const result = approvalWhtPreview(input({ expenseType: 'commission', planWhtPct: null }, { taxProfile: null }))
    expect(result).toMatchObject({ whtSatang: 0, netSatang: 1_234_567, whtRateSource: 'none' })
    expect(result.whtWarning).toBe(WHT_RATE_MISSING_WARNING)
  })

  it('ค่าที่พัก (นอกฐาน) ของผู้รับที่ไม่มี Tax Profile และไม่มีแผน ⇒ ไม่เตือน ไม่ throw', () => {
    const result = approvalWhtPreview(input({ expenseType: 'hotel', planWhtPct: null }, { taxProfile: null }))
    expect(result).toMatchObject({ whtSatang: 0, netSatang: 1_234_567, whtWarning: null, whtRateSource: 'none' })
  })

  it('ไม่มี Tax Profile รายคน แต่มีค่าเริ่มต้นตามประเภท ⇒ ใช้ค่าเริ่มต้น ไม่เตือน (ชนะอัตราแผน)', () => {
    const result = approvalWhtPreview(
      input(
        { planWhtPct: 5 },
        { taxProfile: null, typeDefaultTaxProfile: { whtPct: 3, whtBasis: 'before_vat', whtMinThresholdSatang: 100_000 } },
      ),
    )
    expect(result).toMatchObject({ whtSatang: 37_037, whtRateSource: 'type_default', whtWarning: null })
  })
})

describe('whtBelowThreshold (staging E-039)', () => {
  it('อยู่ในฐาน มีอัตรา แต่ต่ำกว่าเกณฑ์ ⇒ ภาษี 0 และติดธง', () => {
    const result = approvalWhtPreview(input({ grossSatang: 20_000 }))
    expect(result).toMatchObject({ whtSatang: 0, whtPctUsed: 3, whtBelowThreshold: true })
  })
  it('ถึงเกณฑ์ ⇒ ไม่ติดธง · ยอดจากรอบจ่ายที่บันทึกแล้ว ⇒ ไม่ติดธง', () => {
    expect(approvalWhtPreview(input()).whtBelowThreshold).toBe(false)
    const fromPayout = approvalWhtPreview(
      input({
        grossSatang: 20_000,
        payoutItem: { whtSatang: 0, netSatang: 20_000, whtPctSnapshot: 3, whtCondition: 'withhold' },
      }),
    )
    expect(fromPayout.whtBelowThreshold).toBe(false)
  })
})

describe('mytester F-03 — คิวอนุมัติคิดเกณฑ์รวมต่อผู้รับ + ยอดสะสมของเดือน', () => {
  it('ค่าน้ำมัน/เบี้ยเสี่ยงยอดเล็กของผู้รับที่มีค่าคอมรวมเกินเกณฑ์ ⇒ ถูกหักด้วย (ไม่ใช่ ฿0)', () => {
    const rows = [
      { ...input({ grossSatang: 100_000, expenseType: 'commission' }), payeeId: 'p1' },
      { ...input({ grossSatang: 9_336, expenseType: 'fuel' }), payeeId: 'p1' },
    ]
    const [commission, fuel] = approvalWhtPreviews(rows)
    expect(fuel!.whtBelowThreshold).toBe(false)
    expect(fuel!.whtSatang).toBeGreaterThan(0)
    // ทีละรายการ (แบบเดิม) ค่าน้ำมันต่ำกว่าเกณฑ์ ⇒ 0
    expect(approvalWhtPreview(rows[1]!).whtSatang).toBe(0)
    expect(commission!.whtSatang + fuel!.whtSatang).toBe(Math.round((109_336 * 3) / 100))
  })

  it('ยอดสะสมของเดือนเกินเกณฑ์แล้ว ⇒ รายการเดี่ยวยอดเล็กถูกหัก', () => {
    const row = { ...input({ grossSatang: 30_000, expenseType: 'commission' }), payeeId: 'p2' }
    expect(approvalWhtPreviews([row])[0]!.whtSatang).toBe(0)
    const withMonth = approvalWhtPreviews([row], {
      monthToDate: new Map([['p2', { priorBaseSatang: 150_000, priorUnwithheldBaseSatang: 0 }]]),
    })
    expect(withMonth[0]!.whtSatang).toBeGreaterThan(0)
  })

  it('ผู้รับต่างกันไม่ปนกลุ่ม · รายการที่เข้ารอบแล้วใช้ยอดของรอบ', () => {
    const fromPayout = {
      ...input({ grossSatang: 50_000, payoutItem: { whtSatang: 1_500, netSatang: 48_500, whtPctSnapshot: 3, whtCondition: 'withhold' } }),
      payeeId: 'p1',
    }
    const other = { ...input({ grossSatang: 50_000 }), payeeId: 'p3' }
    const [batched, alone] = approvalWhtPreviews([fromPayout, other])
    expect(batched!.whtFromPayout).toBe(true)
    expect(batched!.whtSatang).toBe(1_500)
    expect(alone!.whtSatang).toBe(0)
  })
})

describe('mytester F-03 รีวิว — คิวคิดแบบรอบจ่ายถัดไป (เฉพาะรายการอนุมัติแล้ว)', () => {
  it('ค่าน้ำมันอนุมัติแล้ว + ค่าคอมยังรออนุมัติ ⇒ ค่าน้ำมันไม่ถูกหัก (รอบจ่ายตอนนี้มีแค่ค่าน้ำมัน) · ค่าคอมคิดรวมกับรายการอนุมัติแล้ว', () => {
    const fuel = { ...input({ grossSatang: 9_300, expenseType: 'fuel' }), payeeId: 'p1', approved: true }
    const commission = { ...input({ grossSatang: 100_000, expenseType: 'commission' }), payeeId: 'p1', approved: false }
    const [fuelPreview, commissionPreview] = approvalWhtPreviewsForNextBatch([fuel, commission])
    expect(fuelPreview!.whtSatang).toBe(0)
    expect(fuelPreview!.whtBelowThreshold).toBe(true)
    // ถ้าค่าคอมอนุมัติแล้วเข้ารอบเดียวกับค่าน้ำมัน: ฐาน 1,093 ⇒ หัก 3% ส่วนของค่าคอม
    expect(commissionPreview!.whtSatang).toBe(approvalWhtPreviews([fuel, commission]).at(-1)!.whtSatang)
    expect(commissionPreview!.whtSatang).toBeGreaterThan(0)
  })

  it('รายการรออนุมัติสองรายการไม่นับรวมกัน (ต่างคนต่างคิดกับชุดอนุมัติแล้ว)', () => {
    const a = { ...input({ grossSatang: 60_000 }), payeeId: 'p2', approved: false }
    const b = { ...input({ grossSatang: 60_000 }), payeeId: 'p2', approved: false }
    expect(approvalWhtPreviewsForNextBatch([a, b]).map((preview) => preview.whtSatang)).toEqual([0, 0])
  })

  it('ขาดอัตรา 40(2) ⇒ ทุกแถวของกลุ่มเตือน รวมแถวนอกฐาน (รอบจ่ายปฏิเสธทั้งรอบของผู้รับ)', () => {
    const policy = { ...DEFAULT_WHT_POLICY, incomeTypeMode: 'all_40_2' as const }
    const commission = { ...input({ policy, expenseType: 'commission' }, { wht402Pct: null }), payeeId: 'p3' }
    const hotel = { ...input({ policy, expenseType: 'hotel' }, { wht402Pct: null }), payeeId: 'p3' }
    const previews = approvalWhtPreviews([commission, hotel])
    expect(previews.every((preview) => preview.whtWarning === WHT_402_RATE_MISSING_WARNING)).toBe(true)
  })
})

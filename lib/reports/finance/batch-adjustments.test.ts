import { describe, expect, it } from 'vitest'
import {
  allocateBatchAdjustment,
  batchAdjustmentShareInRange,
  batchAdjustmentSharesByRevenue,
  type BatchRevenueMember,
} from '@/lib/reports/finance/batch-adjustments'
import { buildRevenueReconciliation } from '@/lib/reports/finance/revenue-reconciliation'

const revenues: BatchRevenueMember[] = [
  { id: 'r3', billingBatchId: 'b1', grossSatang: 125_000 },
  { id: 'r1', billingBatchId: 'b1', grossSatang: 124_000 },
  { id: 'r2', billingBatchId: 'b1', grossSatang: 124_000 },
  { id: 'x1', billingBatchId: 'b2', grossSatang: 50_000 },
  { id: 'u1', billingBatchId: null, grossSatang: 9_999 },
]

const sum = (map: Map<string, number>): number => [...map.values()].reduce((total, value) => total + value, 0)

describe('Adjustment ระดับรอบวางบิล → รายได้ (มติ U69)', () => {
  it('กระจายตามสัดส่วนยอดเคสในรอบ ผลรวมเท่ายอด Adjustment พอดี (ไม่หายเศษสตางค์)', () => {
    const shares = allocateBatchAdjustment(10_000, revenues, 'b1')
    expect(sum(shares)).toBe(10_000)
    expect([...shares.keys()]).toEqual(['r1', 'r2', 'r3'])
    // 10,000 × 124/373 = 3,324.39 · 125/373 = 3,351.21 ⇒ เศษ 1 สตางค์ลงใบที่เศษมากสุด
    expect(shares.get('r1')).toBe(3_325)
    expect(shares.get('r2')).toBe(3_324)
    expect(shares.get('r3')).toBe(3_351)
    expect(shares.has('x1')).toBe(false)
  })

  it('ผลเหมือนเดิมทุกครั้งไม่ขึ้นกับลำดับที่ query ส่งมา', () => {
    const reversed = [...revenues].reverse()
    expect([...allocateBatchAdjustment(10_001, reversed, 'b1')]).toEqual([...allocateBatchAdjustment(10_001, revenues, 'b1')])
  })

  it('รายได้ทุกใบเป็น 0 ⇒ แบ่งเท่ากัน · รอบไม่มีรายได้ ⇒ ว่าง', () => {
    const zero: BatchRevenueMember[] = [
      { id: 'a', billingBatchId: 'z', grossSatang: 0 },
      { id: 'b', billingBatchId: 'z', grossSatang: 0 },
    ]
    expect([...allocateBatchAdjustment(101, zero, 'z')]).toEqual([
      ['a', 51],
      ['b', 50],
    ])
    expect(allocateBatchAdjustment(100, zero, 'none').size).toBe(0)
  })

  it('ลด = ติดลบ · เพิ่ม = บวก · หลายรายการในรอบเดียวรวมกันต่อรายได้', () => {
    const shares = batchAdjustmentSharesByRevenue(revenues, [
      { billingBatchId: 'b1', adjustmentType: 'decrease', amountSatang: 37_300 },
      { billingBatchId: 'b1', adjustmentType: 'increase', amountSatang: 3_730 },
      { billingBatchId: 'b2', adjustmentType: 'increase', amountSatang: 500 },
    ])
    expect(shares.get('r1')).toBe(-12_400 + 1_240)
    expect(shares.get('r3')).toBe(-12_500 + 1_250)
    expect(shares.get('x1')).toBe(500)
    expect(shares.has('u1')).toBe(false)
    expect(sum(shares)).toBe(-37_300 + 3_730 + 500)
  })

  it('ส่วนในช่วงรายงาน = ผลรวมส่วนแบ่งของรายได้ในช่วงเท่านั้น', () => {
    const adjustment = { billingBatchId: 'b1', adjustmentType: 'decrease' as const, amountSatang: 10_000 }
    expect(batchAdjustmentShareInRange(adjustment, revenues, new Set(['r1', 'r3']))).toBe(3_325 + 3_351)
    expect(batchAdjustmentShareInRange(adjustment, revenues, new Set(['r1', 'r2', 'r3']))).toBe(10_000)
    expect(batchAdjustmentShareInRange(adjustment, revenues, new Set())).toBe(0)
  })

  it('F2 + กระทบยอด U44 ลงตัวเมื่อมี Adjustment ระดับรอบที่รอใบลดหนี้ (รอบคร่อมช่วงรายงาน)', () => {
    // ช่วงรายงานมีแค่ r1/r2 (r3 อยู่เดือนก่อน) · ใบกำกับ active ทั้งรอบ
    const inRange = new Set(['r1', 'r2'])
    const adjustment = { billingBatchId: 'b1', adjustmentType: 'decrease' as const, amountSatang: 10_000 }
    const shares = batchAdjustmentSharesByRevenue(revenues, [adjustment])
    const reportTotalSatang = [...inRange].reduce((total, id) => {
      const gross = revenues.find((row) => row.id === id)?.grossSatang ?? 0
      return total + gross + (shares.get(id) ?? 0)
    }, 0)
    const result = buildRevenueReconciliation({
      reportTotalSatang,
      revenues: [
        { grossSatang: 124_000, invoiced: true },
        { grossSatang: 124_000, invoiced: true },
      ],
      adjustments: [
        {
          adjustmentType: 'decrease',
          amountSatang: batchAdjustmentShareInRange(adjustment, revenues, inRange),
          invoiced: true,
          hasActiveNote: false,
        },
      ],
      notes: [],
    })
    expect(reportTotalSatang).toBe(248_000 - 6_649)
    expect(result.balanced).toBe(true)
    expect(result.lines.find((row) => row.key === 'awaitingCredit')?.amountSatang).toBe(6_649)
  })
})

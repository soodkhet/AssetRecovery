import { describe, expect, it } from 'vitest'
import {
  DIRECT_COST_EXPENSE_TYPES,
  countCasesWithCostOnly,
  isDirectCostExpenseType,
  summarizeCostBreakdown,
  summarizeProfitability,
  type ProfitCostEntry,
  type ProfitRevenueEntry,
} from '@/lib/reports/profitability'

const revenue = (
  key: string,
  label: string,
  revenueSatang: number,
  caseId: string,
): ProfitRevenueEntry => ({ key, label, revenueSatang, caseId })

const cost = (
  key: string,
  label: string,
  grossSatang: number,
  caseId: string | null,
  expenseType: ProfitCostEntry['expenseType'] = 'fuel',
): ProfitCostEntry => ({ key, label, grossSatang, caseId, expenseType })

describe('summarizeProfitability', () => {
  it('รวมรายได้/ต้นทุนตามมิติ + margin ของยอดรวมคิดจากยอดรวม', () => {
    const result = summarizeProfitability(
      [revenue('c1', 'ไฟแนนซ์ A', 1_000_00, 'case-1'), revenue('c1', 'ไฟแนนซ์ A', 500_00, 'case-2')],
      [cost('c1', 'ไฟแนนซ์ A', 600_00, 'case-1'), cost('c1', 'ไฟแนนซ์ A', 150_00, 'case-2', 'allowance')],
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      key: 'c1',
      label: 'ไฟแนนซ์ A',
      revenueSatang: 1_500_00,
      directCostSatang: 750_00,
      grossProfitSatang: 750_00,
      marginPct: 50,
      revenueCaseCount: 2,
      costCaseCount: 2,
    })
    expect(result.total).toMatchObject({ revenueSatang: 1_500_00, grossProfitSatang: 750_00, marginPct: 50 })
  })

  it('`21` §16 — มิติที่มีแต่ต้นทุน (เคส closed_fail) ต้องอยู่ในรายงานและกด margin รวมลงจริง', () => {
    const withFailures = summarizeProfitability(
      [revenue('t1', 'ทีมเหนือ', 1_000_00, 'case-ok')],
      [cost('t1', 'ทีมเหนือ', 200_00, 'case-ok'), cost('t2', 'ทีมใต้', 300_00, 'case-fail', 'no_success_fee')],
    )

    const failRow = withFailures.rows.find((row) => row.key === 't2')
    expect(failRow).toBeDefined()
    expect(failRow?.revenueSatang).toBe(0)
    // ห้ามหารศูนย์ — revenue = 0 ⇒ margin เป็น null (แสดง "N/A")
    expect(failRow?.marginPct).toBeNull()
    expect(failRow?.grossProfitSatang).toBe(-300_00)

    // margin รวมต้องต่ำกว่าเคสที่ไม่มีต้นทุนเคสไม่สำเร็จ (80% → 50%)
    expect(withFailures.total.marginPct).toBe(50)
    const withoutFailures = summarizeProfitability(
      [revenue('t1', 'ทีมเหนือ', 1_000_00, 'case-ok')],
      [cost('t1', 'ทีมเหนือ', 200_00, 'case-ok')],
    )
    expect(withoutFailures.total.marginPct).toBe(80)
  })

  it('ไม่มีข้อมูลเลย ⇒ ยอดรวม 0 และ margin เป็น null', () => {
    const result = summarizeProfitability([], [])
    expect(result.rows).toHaveLength(0)
    expect(result.total).toMatchObject({ revenueSatang: 0, directCostSatang: 0, grossProfitSatang: 0, marginPct: null })
  })

  it('เรียงจากกำไรมากไปน้อย — มิติที่ขาดทุนอยู่ท้ายตาราง', () => {
    const result = summarizeProfitability(
      [revenue('a', 'A', 100_00, 'case-a'), revenue('b', 'B', 900_00, 'case-b')],
      [cost('a', 'A', 400_00, 'case-a'), cost('b', 'B', 100_00, 'case-b')],
    )
    expect(result.rows.map((row) => row.key)).toEqual(['b', 'a'])
  })

  it('มิติว่าง (key = null) ถูกจัดเป็น "ไม่ระบุมิติ" ไม่ใช่หายไปเฉย ๆ', () => {
    const result = summarizeProfitability([], [{ ...cost('x', 'X', 50_00, 'case-x'), key: null, label: null }])
    expect(result.rows[0]?.label).toBe('ไม่ระบุมิติ')
    expect(result.total.directCostSatang).toBe(50_00)
  })

  it('นับเคสแบบไม่ซ้ำ — 2 รายการเบิกของเคสเดียวนับเป็น 1 เคส', () => {
    const result = summarizeProfitability(
      [],
      [cost('t1', 'ทีม', 100_00, 'case-1'), cost('t1', 'ทีม', 50_00, 'case-1', 'allowance')],
    )
    expect(result.rows[0]?.costCaseCount).toBe(1)
    expect(result.rows[0]?.directCostSatang).toBe(150_00)
  })

  it('ยอดที่ไม่ใช่ satang (ทศนิยม) ⇒ โยนทันที', () => {
    expect(() => summarizeProfitability([revenue('c', 'C', 10.5, 'case-1')], [])).toThrow()
    expect(() => summarizeProfitability([], [cost('c', 'C', 10.5, 'case-1')])).toThrow()
  })
})

describe('summarizeCostBreakdown', () => {
  it('แยกตามชนิดต้นทุน + เรียงตามลำดับคงที่ + ตัดชนิดที่ไม่มีรายการ', () => {
    const rows = summarizeCostBreakdown([
      cost('t', 'ทีม', 300_00, 'case-1', 'commission'),
      cost('t', 'ทีม', 100_00, 'case-1', 'fuel'),
      cost('t', 'ทีม', 50_00, 'case-2', 'fuel'),
    ])
    expect(rows.map((row) => row.expenseType)).toEqual(['fuel', 'commission'])
    expect(rows[0]).toMatchObject({ count: 2, amountSatang: 150_00 })
    expect(rows[1]).toMatchObject({ count: 1, amountSatang: 300_00 })
  })

  it('ไม่มีต้นทุนเลย ⇒ ตารางว่าง', () => {
    expect(summarizeCostBreakdown([])).toEqual([])
  })
})

describe('countCasesWithCostOnly', () => {
  it('นับเฉพาะเคสที่มีต้นทุนแต่ไม่มีรายได้ (`21` §16)', () => {
    const result = countCasesWithCostOnly(
      [revenue('t', 'ทีม', 500_00, 'case-ok')],
      [
        cost('t', 'ทีม', 100_00, 'case-ok'),
        cost('t', 'ทีม', 80_00, 'case-fail'),
        cost('t', 'ทีม', 20_00, 'case-fail', 'allowance'),
        cost('t', 'ทีม', 30_00, null),
      ],
    )
    expect(result).toEqual({ caseCount: 1, costSatang: 100_00 })
  })
})

describe('isDirectCostExpenseType', () => {
  it('รับเฉพาะ 4 ชนิดของ `22` §6.12 — ที่พัก/ใบเสร็จ/manual ไม่ใช่ต้นทุนตรง', () => {
    for (const type of DIRECT_COST_EXPENSE_TYPES) expect(isDirectCostExpenseType(type)).toBe(true)
    expect(isDirectCostExpenseType('hotel')).toBe(false)
    expect(isDirectCostExpenseType('receipt')).toBe(false)
    expect(isDirectCostExpenseType('manual')).toBe(false)
  })
})

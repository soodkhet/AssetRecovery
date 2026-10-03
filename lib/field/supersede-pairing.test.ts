import { describe, expect, it } from 'vitest'
import { pairSupersededExpenses } from '@/lib/field/supersede-pairing'

describe('จับคู่รายการเบิกเดิม → รายการใหม่ (UAT BUG-051)', () => {
  it('ค่าน้ำมันเดิมชี้ค่าน้ำมันใหม่ เบี้ยเลี้ยงชี้เบี้ยเลี้ยง — ไม่ผูกทุกแถวกับแถวแรก', () => {
    const pairs = pairSupersededExpenses(
      [
        { id: 'old-fuel', expenseType: 'fuel', expenseDate: '2026-10-01' },
        { id: 'old-allow', expenseType: 'allowance', expenseDate: '2026-10-01' },
      ],
      [
        { id: 'new-allow', expenseType: 'allowance', expenseDate: '2026-10-01' },
        { id: 'new-fuel', expenseType: 'fuel', expenseDate: '2026-10-01' },
      ],
    )
    expect(pairs).toEqual(
      expect.arrayContaining([
        { supersededId: 'old-fuel', replacementId: 'new-fuel' },
        { supersededId: 'old-allow', replacementId: 'new-allow' },
      ]),
    )
    expect(pairs).toHaveLength(2)
  })

  it('ชนิดเดียวกันหลายแถว จับคู่ตามลำดับวันที่ทีละตัว', () => {
    const pairs = pairSupersededExpenses(
      [
        { id: 'a2', expenseType: 'allowance', expenseDate: '2026-10-02' },
        { id: 'a1', expenseType: 'allowance', expenseDate: '2026-10-01' },
      ],
      [
        { id: 'n2', expenseType: 'allowance', expenseDate: '2026-10-02' },
        { id: 'n1', expenseType: 'allowance', expenseDate: '2026-10-01' },
      ],
    )
    expect(pairs).toEqual([
      { supersededId: 'a1', replacementId: 'n1' },
      { supersededId: 'a2', replacementId: 'n2' },
    ])
  })

  it('ไม่มีแถวใหม่ชนิดเดียวกัน = ไม่ผูก (ดีกว่าชี้ผิดตัว)', () => {
    expect(
      pairSupersededExpenses(
        [{ id: 'old-fuel', expenseType: 'fuel', expenseDate: '2026-10-01' }],
        [{ id: 'new-allow', expenseType: 'allowance', expenseDate: '2026-10-01' }],
      ),
    ).toEqual([])
    expect(pairSupersededExpenses([], [{ id: 'n', expenseType: 'fuel', expenseDate: '2026-10-01' }])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { ACTIVE_EXPENSE_STATUSES } from '@/lib/field/expense-status'
import {
  CASE_BOUND_STATUS_FILTERS,
  EXPENSE_STATUS_LABEL,
  EXPENSE_TYPE_LABEL,
  SEPARATE_STATUS_FILTERS,
  aggregateExpenseStatus,
  canResubmitExpense,
  expenseStatusBadgeGroup,
  filterCaseGroups,
  filterSeparateExpenses,
  groupExpensesByCase,
  isActiveExpense,
  isSeparateExpense,
  matchesExpenseStatusFilter,
  splitExpensesNeedingRevision,
  sumActiveExpenses,
} from '@/lib/field/expense-ui'
import { ALL_MONTHS } from '@/lib/field/month-filter'
import type { FieldExpenseDto } from '@/lib/field/types'
import { ExpenseStatus, ExpenseType } from '@/lib/generated/prisma/enums'

const EXPENSE_STATUS_VALUES = Object.values(ExpenseStatus)
const EXPENSE_TYPE_VALUES = Object.values(ExpenseType)

function expense(overrides: Partial<FieldExpenseDto> = {}): FieldExpenseDto {
  return {
    id: 'exp-1',
    caseId: 'case-1',
    caseRef: 'REF-001',
    debtorName: 'ลูกหนี้ ก',
    expenseType: 'fuel',
    grossSatang: 25_000,
    distanceKm: '12.50',
    expenseDate: '2026-08-10',
    status: 'pending_approval',
    rejectReason: null,
    note: null,
    receiptFileUrl: null,
    sharedWithUserId: null,
    sharedWithName: null,
    matchedCaseIds: [],
    createdAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('ป้าย/สีของรายการเบิก (`41` §6.6 · `04` §8.1)', () => {
  it('ครบทุกค่าของ enum `expense_status` และ `expense_type` (`02` §3)', () => {
    for (const status of EXPENSE_STATUS_VALUES) {
      expect(EXPENSE_STATUS_LABEL[status]).toBeTruthy()
      expect(expenseStatusBadgeGroup(status)).toBeTruthy()
    }
    for (const type of EXPENSE_TYPE_VALUES) {
      expect(EXPENSE_TYPE_LABEL[type]).toBeTruthy()
    }
  })

  it('สถานะที่ยังมีผลตรงกับชุดเดียวกับฝั่ง BE', () => {
    for (const status of EXPENSE_STATUS_VALUES) {
      expect(isActiveExpense(status)).toBe(ACTIVE_EXPENSE_STATUSES.includes(status))
    }
  })

  it('แก้แล้วส่งใหม่ได้เฉพาะรายการที่ถูกตีกลับ (`41` §8 resubmit_expense)', () => {
    expect(canResubmitExpense(expense({ status: 'needs_revision' }))).toBe(true)
    expect(canResubmitExpense(expense({ status: 'pending_approval' }))).toBe(false)
    expect(canResubmitExpense(expense({ status: 'rejected' }))).toBe(false)
  })

  it('รายการเบิกแยก = ไม่ผูกเคส', () => {
    expect(isSeparateExpense(expense({ caseId: null, expenseType: 'hotel' }))).toBe(true)
    expect(isSeparateExpense(expense())).toBe(false)
  })
})

describe('ตัวกรองสถานะ (`41` §7.9)', () => {
  it('"ทุกสถานะ" ผ่านทุกค่ารวม superseded', () => {
    for (const status of EXPENSE_STATUS_VALUES) {
      expect(matchesExpenseStatusFilter(status, 'all')).toBe(true)
    }
  })

  it('"รออนุมัติจ่าย" ครอบทั้งขั้นหัวหน้าและขั้นการเงิน', () => {
    expect(matchesExpenseStatusFilter('pending_approval', 'approval')).toBe(true)
    expect(matchesExpenseStatusFilter('pending_finance_approval', 'approval')).toBe(true)
    expect(matchesExpenseStatusFilter('pending_warehouse_confirm', 'approval')).toBe(false)
  })

  it('needs_revision ไม่ตกอยู่ในตัวกรองใดเลย (ถูกยกขึ้นบล็อกบนสุด)', () => {
    for (const filter of [...CASE_BOUND_STATUS_FILTERS, ...SEPARATE_STATUS_FILTERS]) {
      if (filter === 'all') continue
      expect(matchesExpenseStatusFilter('needs_revision', filter)).toBe(false)
    }
  })

  it('แต่ละแท็บมีชุดตัวเลือกของตัวเอง — เบิกแยกไม่มี "รอยืนยันคืนคลัง"', () => {
    expect(CASE_BOUND_STATUS_FILTERS).toContain('warehouse')
    expect(SEPARATE_STATUS_FILTERS).not.toContain('warehouse')
    expect(SEPARATE_STATUS_FILTERS).toContain('rejected')
  })

  it('แยกรายการที่ถูกตีกลับออกจากรายการปกติ', () => {
    const items = [
      expense({ id: 'a', status: 'needs_revision' }),
      expense({ id: 'b', status: 'approved' }),
      expense({ id: 'c', status: 'needs_revision' }),
    ]
    const split = splitExpensesNeedingRevision(items)
    expect(split.needsRevision.map((item) => item.id)).toEqual(['a', 'c'])
    expect(split.rest.map((item) => item.id)).toEqual(['b'])
  })
})

describe('สถานะรวม (`41` §7.9 แถวสรุปต่อเคส · §7.11 ป้ายบนการ์ด)', () => {
  it('รายการที่ต้องแก้มาก่อนขั้นอนุมัติเสมอ', () => {
    expect(aggregateExpenseStatus(['approved', 'needs_revision'])).toBe('needs_revision')
    expect(aggregateExpenseStatus(['approved', 'pending_warehouse_confirm'])).toBe('pending_warehouse_confirm')
    expect(aggregateExpenseStatus(['approved', 'pending_finance_approval'])).toBe('pending_finance_approval')
    expect(aggregateExpenseStatus(['approved', 'approved'])).toBe('approved')
  })

  it('ไม่มีรายการเลยคืน null (เคสไม่มี expense — DEC-006/D6)', () => {
    expect(aggregateExpenseStatus([])).toBeNull()
  })
})

describe('จัดกลุ่มรายการผูกกับเคส (`41` §7.9)', () => {
  const items = [
    expense({ id: 'f1', caseId: 'case-1', expenseType: 'fuel', grossSatang: 25_000, expenseDate: '2026-08-10' }),
    expense({ id: 'a1', caseId: 'case-1', expenseType: 'allowance', grossSatang: 30_000, expenseDate: '2026-08-10' }),
    expense({
      id: 'old',
      caseId: 'case-1',
      expenseType: 'fuel',
      grossSatang: 99_000,
      expenseDate: '2026-08-09',
      status: 'superseded',
    }),
    expense({
      id: 'f2',
      caseId: 'case-2',
      caseRef: 'REF-002',
      grossSatang: 12_000,
      expenseDate: '2026-08-12',
      status: 'pending_warehouse_confirm',
    }),
  ]

  it('1 เคส = 1 แถว รวมยอด fuel+allowance เป็น satang', () => {
    const groups = groupExpensesByCase(items)
    const first = groups.find((group) => group.caseId === 'case-1')
    expect(first?.totalSatang).toBe(55_000)
    expect(first?.items).toHaveLength(2)
  })

  it('รายการที่ถูกแทนที่แยกบล็อกและไม่เข้ายอด (`41` §10.1)', () => {
    const group = groupExpensesByCase(items).find((row) => row.caseId === 'case-1')
    expect(group?.supersededItems.map((item) => item.id)).toEqual(['old'])
    expect(group?.totalSatang).toBe(55_000)
  })

  it('เรียงเคสตามวันใหม่→เก่า', () => {
    expect(groupExpensesByCase(items).map((group) => group.caseId)).toEqual(['case-2', 'case-1'])
  })

  it('ตัวกรองเทียบกับสถานะรวมของกลุ่ม', () => {
    const groups = groupExpensesByCase(items)
    expect(filterCaseGroups(groups, 'warehouse').map((group) => group.caseId)).toEqual(['case-2'])
    expect(filterCaseGroups(groups, 'approval').map((group) => group.caseId)).toEqual(['case-1'])
    expect(filterCaseGroups(groups, 'all')).toHaveLength(2)
  })

  it('รายการเบิกแยก (ไม่มี caseId) ไม่หลุดเข้ากลุ่มเคส', () => {
    expect(groupExpensesByCase([expense({ caseId: null, expenseType: 'hotel' })])).toHaveLength(0)
  })

  it('กลุ่มที่เหลือแต่รายการถูกแทนที่ยังจัดกลุ่มได้ (ยอด 0)', () => {
    const groups = groupExpensesByCase([expense({ id: 'x', status: 'superseded', grossSatang: 5_000 })])
    expect(groups[0]?.status).toBe('superseded')
    expect(groups[0]?.totalSatang).toBe(0)
  })
})

describe('แท็บเบิกแยก — สถานะ + เดือนทำงานร่วมกัน (`41` §7.9)', () => {
  const items = [
    expense({ id: 'h1', caseId: null, expenseType: 'hotel', expenseDate: '2026-08-05', status: 'approved' }),
    expense({ id: 'h2', caseId: null, expenseType: 'hotel', expenseDate: '2026-07-20', status: 'approved' }),
    expense({ id: 'h3', caseId: null, expenseType: 'hotel', expenseDate: '2026-08-21', status: 'rejected' }),
  ]

  it('กรองสถานะอย่างเดียว', () => {
    expect(filterSeparateExpenses(items, 'approved', ALL_MONTHS).map((item) => item.id)).toEqual(['h1', 'h2'])
  })

  it('กรองเดือนอย่างเดียว', () => {
    expect(filterSeparateExpenses(items, 'all', '2026-08').map((item) => item.id)).toEqual(['h1', 'h3'])
  })

  it('สองตัวกรองทำงานร่วมกัน', () => {
    expect(filterSeparateExpenses(items, 'approved', '2026-08').map((item) => item.id)).toEqual(['h1'])
  })
})

describe('รวมยอด', () => {
  it('นับเฉพาะรายการที่ยังมีผล (rejected/superseded ไม่เข้า)', () => {
    const items = [
      expense({ grossSatang: 10_000, status: 'approved' }),
      expense({ grossSatang: 20_000, status: 'pending_approval' }),
      expense({ grossSatang: 40_000, status: 'rejected' }),
      expense({ grossSatang: 80_000, status: 'superseded' }),
    ]
    expect(sumActiveExpenses(items)).toBe(30_000)
  })
})

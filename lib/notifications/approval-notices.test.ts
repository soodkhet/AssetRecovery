import { describe, expect, it } from 'vitest'
import {
  expenseNoticeDedupeKey,
  expenseNoticeScope,
  planExpenseApprovalNotices,
  type ExpenseQueueItem,
} from '@/lib/notifications/approval-notices'

/** มติ PO 05/10/2569 U29 (BUG-106) — แผนการแจ้งผู้อนุมัติขั้นที่รออยู่ (pure) */

function item(overrides: Partial<ExpenseQueueItem> & Pick<ExpenseQueueItem, 'id'>): ExpenseQueueItem {
  return {
    expenseType: 'fuel',
    grossSatang: 15_000,
    caseRef: 'CASE-1',
    requesterUserId: 'agent-1',
    requesterName: 'พนักงาน 1',
    teamId: 'team-a',
    step: 1,
    totalSteps: 2,
    column: 'manager',
    capability: 'approve_expense_manager',
    historyLength: 0,
    excludeUserIds: ['agent-1'],
    ...overrides,
  }
}

describe('planExpenseApprovalNotices', () => {
  it('เหตุการณ์เดียวหลายแถวของผู้ขอคนเดียว → 1 ข้อความ พร้อมชนิดไม่ซ้ำ จำนวน และยอดรวม satang', () => {
    const notices = planExpenseApprovalNotices([
      item({ id: 'e1', expenseType: 'fuel', grossSatang: 15_000 }),
      item({ id: 'e2', expenseType: 'no_success_fee', grossSatang: 50_000 }),
      item({ id: 'e3', expenseType: 'fuel', grossSatang: 15_000, caseRef: 'CASE-2' }),
    ])
    expect(notices).toHaveLength(1)
    const [notice] = notices
    expect(notice?.capability).toBe('approve_expense_manager')
    expect(notice?.scope).toEqual({ teamId: 'team-a' })
    expect(notice?.excludeUserIds).toEqual(['agent-1'])
    expect(notice?.message.body).toBe(
      'ค่าน้ำมัน, เบี้ยเสี่ยง · ผู้ขอ พนักงาน 1 · 3 รายการ รวม ฿800.00 (เคส CASE-1, CASE-2)',
    )
  })

  it('คนละผู้ขอ / คนละทีม (ขั้นผู้จัดการ) / คนละขั้น → แยกข้อความ', () => {
    const notices = planExpenseApprovalNotices([
      item({ id: 'e1' }),
      item({ id: 'e2', requesterUserId: 'agent-2', requesterName: 'พนักงาน 2', excludeUserIds: ['agent-2'] }),
      item({ id: 'e3', teamId: 'team-b' }),
      item({ id: 'e4', step: 2, column: 'finance', capability: 'approve_expense_finance', historyLength: 1 }),
    ])
    expect(notices).toHaveLength(4)
  })

  it('ขั้นผู้จัดการผูกทีมของรายการ · ขั้นการเงิน/บริหารเป็นระดับองค์กร (ไม่ผูกทีม)', () => {
    expect(expenseNoticeScope('manager', 'team-a')).toEqual({ teamId: 'team-a' })
    expect(expenseNoticeScope('manager', null)).toEqual({ teamId: null })
    expect(expenseNoticeScope('finance', 'team-a')).toEqual({})
    expect(expenseNoticeScope('executive', 'team-a')).toEqual({})

    // ขั้นการเงินจากสองทีมของผู้ขอคนเดียวกัน = ผู้รับชุดเดียวกัน ⇒ รวมเป็นข้อความเดียว
    const notices = planExpenseApprovalNotices([
      item({ id: 'e1', step: 2, column: 'finance', capability: 'approve_expense_finance', teamId: 'team-a' }),
      item({ id: 'e2', step: 2, column: 'finance', capability: 'approve_expense_finance', teamId: 'team-b' }),
    ])
    expect(notices).toHaveLength(1)
    expect(notices[0]?.scope).toEqual({})
    expect(notices[0]?.message.title).toBe('รายการเบิกรออนุมัติ ขั้น 2/2')
  })

  it('ไม่มีรายการ → ไม่มีข้อความ', () => {
    expect(planExpenseApprovalNotices([])).toEqual([])
  })
})

describe('expenseNoticeDedupeKey — กันแจ้งซ้ำเมื่อ event ส่งซ้ำ', () => {
  it('ชุดเดิม (ลำดับต่างกันได้) = คีย์เดิม · ไม่มีเวลาปัจจุบันในคีย์', () => {
    const a = expenseNoticeDedupeKey([
      { id: 'e1', step: 1, historyLength: 0 },
      { id: 'e2', step: 1, historyLength: 0 },
    ])
    const b = expenseNoticeDedupeKey([
      { id: 'e2', step: 1, historyLength: 0 },
      { id: 'e1', step: 1, historyLength: 0 },
    ])
    expect(a).toBe(b)
    expect(a).toMatch(/^expense-approval-[0-9a-f]{32}$/)
  })

  it('ขยับขั้น หรือส่งใหม่หลังตีกลับ (history ยาวขึ้น) = คีย์ใหม่ ⇒ แจ้งรอบใหม่ได้จริง', () => {
    const first = expenseNoticeDedupeKey([{ id: 'e1', step: 1, historyLength: 0 }])
    expect(expenseNoticeDedupeKey([{ id: 'e1', step: 2, historyLength: 1 }])).not.toBe(first)
    expect(expenseNoticeDedupeKey([{ id: 'e1', step: 1, historyLength: 2 }])).not.toBe(first)
  })
})

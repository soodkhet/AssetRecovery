import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCOUNTING_TABS } from '@/lib/accounting/accounting-tabs'
import { FIELD_NAV_ITEMS } from '@/lib/field/field-nav'
import { EXPENSE_VIEW_TYPES } from '@/lib/field/schemas'
import { FINANCE_OPERATION_TABS } from '@/lib/finance/operation-tabs'
import { NOTIFICATION_ONLY_EVENTS, isNotificationEvent, type NotificationEventCode } from '@/lib/notifications/events'
import {
  accountantQuestionMessage,
  advanceOverdueMessage,
  assetIntakeRejectedMessage,
  caseClosedFailMessage,
  caseClosedSuccessMessage,
  caseCloseResubmittedMessage,
  caseCloseResubmittedNotice,
  evidenceRejectedMessage,
  caseDecisionMessage,
  clip,
  exceptionCreatedMessage,
  expenseApprovedMessage,
  expenseApprovalRequestedMessage,
  advanceApprovalRequestedMessage,
  adjustmentApprovalRequestedMessage,
  fieldAllowancePeriodLockedMessage,
  expenseRejectedMessage,
  lotConfirmedMessage,
  payoutBatchCompletedMessage,
  periodSentToAccountantMessage,
  assignmentAcceptedMessage,
  assignmentCreatedMessage,
  assignmentReassignedMessage,
  reassignmentRequestedMessage,
  reassignmentRespondedMessage,
  reassignmentTimeoutMessage,
  whtFilingDueMessage,
  type NotificationMessage,
} from '@/lib/notifications/messages'

/**
 * ข้อความแจ้งเตือนของ Phase 5.2 — สิ่งที่เทสต์ชุดนี้ล็อกไว้:
 * 1. ทุกข้อความใช้ code ที่อยู่ในแค็ตตาล็อก (`90` §6.3) และ **ไม่ใช่** ตัวที่ยัง emit ไม่ได้
 * 2. วันที่บนข้อความเป็น **พ.ศ.** เสมอ (Rule 01) — ค.ศ. บนหน้าจอ = bug
 * 3. เหตุการณ์ที่ผู้เรียกเป็น job/consumer ต้องมี `dedupeKey` เสมอ ไม่งั้นรันซ้ำ = แจ้งซ้ำ
 */

const ALL: readonly NotificationMessage[] = [
  caseDecisionMessage('case.approved', { caseId: 'c1', caseRef: 'CASE-26-0001', reason: 'ครบเอกสาร' }),
  reassignmentRequestedMessage({ caseRef: 'CASE-26-0002', reason: 'ลาป่วย', expiresAt: new Date('2026-08-20T10:00:00Z') }),
  reassignmentTimeoutMessage({ caseRef: 'CASE-26-0003', pendingReassignmentId: 'p1' }, 'new_agent'),
  reassignmentTimeoutMessage({ caseRef: 'CASE-26-0003', pendingReassignmentId: 'p1' }, 'previous_agent'),
  reassignmentTimeoutMessage({ caseRef: 'CASE-26-0003', pendingReassignmentId: 'p1' }, 'requester'),
  assignmentCreatedMessage({ caseRef: 'CASE-26-0013', assignmentId: 'as1' }),
  assignmentReassignedMessage({ caseRef: 'CASE-26-0014', assignmentId: 'as2', reason: 'ย้ายพื้นที่' }, 'new_agent'),
  assignmentReassignedMessage({ caseRef: 'CASE-26-0014', assignmentId: 'as2', reason: 'ย้ายพื้นที่' }, 'previous_agent'),
  assignmentAcceptedMessage({
    caseRef: 'CASE-26-0015',
    assignmentId: 'as3',
    agentName: 'สมชาย',
    acceptedAt: new Date('2026-10-03T09:39:00Z'),
  }),
  reassignmentRespondedMessage({ caseRef: 'CASE-26-0016', pendingReassignmentId: 'p2', decision: 'consent' }, 'new_agent'),
  reassignmentRespondedMessage({ caseRef: 'CASE-26-0016', pendingReassignmentId: 'p2', decision: 'consent' }, 'requester'),
  reassignmentRespondedMessage(
    { caseRef: 'CASE-26-0016', pendingReassignmentId: 'p2', decision: 'decline', declineReason: 'ใกล้ปิดงาน' },
    'requester',
  ),
  caseClosedSuccessMessage({ caseRef: 'CASE-26-0004', agentName: 'สมชาย' }),
  caseClosedFailMessage({ caseRef: 'CASE-26-0005', agentName: null }),
  caseCloseResubmittedMessage({ caseRef: 'CASE-26-0004', agentName: 'สมชาย', outcome: 'closed_success' }),
  assetIntakeRejectedMessage({ caseRef: 'CASE-26-0006', reason: 'IMEI ไม่ตรง' }),
  lotConfirmedMessage({ lotId: 'l1', lotNumber: 'LOT-2569-001', companyName: 'สยามไฟแนนซ์', assetCount: 3, revenueCount: 2 }),
  expenseApprovedMessage({ grossSatang: 125050, caseRef: 'CASE-26-0007' }),
  expenseApprovalRequestedMessage({
    typeLabels: ['ค่าน้ำมัน', 'เบี้ยเสี่ยง'],
    requesterName: 'สมชาย',
    count: 2,
    totalSatang: 65_000,
    step: 1,
    totalSteps: 2,
    caseRefs: ['CASE-26-0008'],
    dedupeKey: 'expense-approval-x',
  }),
  advanceApprovalRequestedMessage({
    advanceId: 'adv1',
    requesterName: 'สมหญิง',
    requestedSatang: 500_000,
    purpose: 'ค่าเดินทางต่างจังหวัด',
    dueClearDate: new Date('2026-10-20T00:00:00Z'),
  }),
  adjustmentApprovalRequestedMessage({
    adjustmentId: 'adj1',
    adjustmentTypeLabel: 'ลดยอด',
    amountSatang: 12_345,
    targetLabel: 'CASE-26-0010 · ไฟแนนซ์ A · รายได้',
    requesterName: 'การเงิน 1',
    waitingRoles: ['บริหาร'],
  }),
  fieldAllowancePeriodLockedMessage({
    agentId: 'u1',
    agentName: 'in1',
    fieldDate: new Date('2026-09-30T00:00:00Z'),
    caseCount: 2,
    fuelSatang: 30_000,
    allowanceSatang: 20_000,
  }),
  expenseRejectedMessage({ grossSatang: 50000, reason: 'ใบเสร็จไม่ชัด', caseBound: true }),
  expenseRejectedMessage({ grossSatang: 80000, reason: 'ใบเสร็จไม่ชัด', caseBound: false }),
  payoutBatchCompletedMessage({ batchId: 'b1', batchName: 'รอบจ่าย Outsource', netSatang: 9900000, source: 'manual' }),
  advanceOverdueMessage({ advanceId: 'a1', dueClearDate: new Date('2026-08-10T00:00:00Z') }, 'payee'),
  evidenceRejectedMessage({ caseId: 'c9', caseRef: 'CASE-26-0009', reason: 'รูปไม่ชัด' }),
  exceptionCreatedMessage({ title: 'ใบกำกับหาย', periodLabel: 'สิงหาคม 2569' }),
  whtFilingDueMessage({
    summaryId: 's1',
    periodLabel: 'สิงหาคม 2569',
    filingDueDate: new Date('2026-09-15T00:00:00Z'),
    daysLeft: 5,
  }),
  accountantQuestionMessage({ periodLabel: 'สิงหาคม 2569', questionText: 'ค่าน้ำมันเดือนนี้ต่างจากเดือนก่อนมาก' }),
  periodSentToAccountantMessage({ periodId: 'pd1', periodLabel: 'สิงหาคม 2569' }),
]

describe('ข้อความแจ้งเตือนทุกตัว', () => {
  it('ใช้ event code ที่อยู่ในแค็ตตาล็อก และเป็นตัวที่โมดูล emit ได้จริง', () => {
    const blocked = new Set<NotificationEventCode>(NOTIFICATION_ONLY_EVENTS)
    for (const message of ALL) {
      expect(isNotificationEvent(message.eventCode), message.eventCode).toBe(true)
      expect(blocked.has(message.eventCode), `${message.eventCode} ยัง emit ไม่ได้`).toBe(false)
    }
  })

  it('มีหัวข้อเสมอ และลิงก์เป็น path ภายในแอปเท่านั้น (กัน open redirect)', () => {
    for (const message of ALL) {
      expect(message.title.length).toBeGreaterThan(0)
      expect(message.linkPath?.startsWith('/'), message.eventCode).toBe(true)
      expect(message.linkPath?.startsWith('//')).toBe(false)
    }
  })

  it('ลิงก์ไปหน้า Field Tracker ต้องเป็นหน้าที่มีอยู่จริงในเมนู (UAT BUG-049)', () => {
    const fieldHrefs = new Set(FIELD_NAV_ITEMS.map((item) => item.href))
    for (const message of ALL) {
      const path = message.linkPath?.split('?')[0] ?? ''
      if (!path.startsWith('/field')) continue
      expect(fieldHrefs.has(path), `${message.eventCode} → ${path}`).toBe(true)
    }
  })

  it('ทุกลิงก์ชี้หน้าที่มีอยู่จริงใน app/ และ ?tab=/?view= เป็นค่าที่หน้านั้นรู้จัก (UAT BUG-096/099)', () => {
    // route group `(app)` ไม่อยู่ใน URL ⇒ ลองทั้งสองที่
    const pageExists = (urlPath: string): boolean =>
      ['app', path.join('app', '(app)')].some((root) =>
        existsSync(path.join(process.cwd(), root, ...urlPath.split('/').filter(Boolean), 'page.tsx')),
      )
    const knownQuery: Readonly<Record<string, { key: string; values: readonly string[] }>> = {
      '/finance': { key: 'tab', values: FINANCE_OPERATION_TABS.map((tab) => tab.id) },
      '/accounting': { key: 'tab', values: ACCOUNTING_TABS.map((tab) => tab.id) },
      '/field/expenses': { key: 'view', values: EXPENSE_VIEW_TYPES },
    }
    for (const message of ALL) {
      const [urlPath = '', query] = (message.linkPath ?? '').split('?')
      expect(pageExists(urlPath), `${message.eventCode} → ${message.linkPath}`).toBe(true)
      if (query === undefined) continue
      const rule = knownQuery[urlPath]
      expect(rule, `${message.eventCode} → ${message.linkPath} ใช้ query ที่หน้านี้ไม่อ่าน`).toBeDefined()
      const params = new URLSearchParams(query)
      expect([...params.keys()], message.linkPath ?? '').toEqual([rule?.key])
      expect(rule?.values, message.linkPath ?? '').toContain(params.get(rule?.key ?? ''))
    }
  })

  it('ตีกลับรายการเบิก → หน้าเบิกตามขอบแท็บของรายการ ไม่ใช่หน้ารายได้ (UAT BUG-099)', () => {
    expect(expenseRejectedMessage({ grossSatang: 1, reason: 'x', caseBound: true }).linkPath).toBe('/field/expenses')
    expect(expenseRejectedMessage({ grossSatang: 1, reason: 'x', caseBound: false }).linkPath).toBe(
      '/field/expenses?view=separate',
    )
  })

  it('ไม่มีปี ค.ศ. หลุดลงข้อความ — วันที่ต้องเป็น พ.ศ. (Rule 01)', () => {
    for (const message of ALL) {
      expect(`${message.title} ${message.body ?? ''}`).not.toMatch(/\b20\d{2}\b/)
    }
  })

  it('เหตุการณ์ฝั่ง job/consumer มี dedupeKey ครบ (รันซ้ำต้องไม่แจ้งซ้ำ)', () => {
    const mustDedupe = new Set([
      'assignment.reassignment_timeout_resolved',
      'lot.confirmed',
      'payout_batch.completed',
      'advance.overdue',
      'wht.filing_due_reminder',
      'period.sent_to_accountant',
    ])
    for (const message of ALL) {
      if (!mustDedupe.has(message.eventCode)) continue
      expect(message.dedupeKey, message.eventCode).toBeTruthy()
      // คีย์ต้องคำนวณซ้ำได้ ⇒ ห้ามมีเวลาปัจจุบัน/ค่าสุ่มปนเข้าไป
      expect(message.dedupeKey).not.toMatch(/\d{13}/)
    }
  })
})

describe('รายละเอียดข้อความรายตัว', () => {
  it('การตัดสินเคสใช้หัวข้อตาม action และแนบเหตุผลต่อท้าย', () => {
    const rejected = caseDecisionMessage('case.rejected', { caseId: 'c1', caseRef: 'CASE-26-0010', reason: 'เอกสารไม่ครบ' })
    expect(rejected.title).toBe('เคสถูกปฏิเสธ')
    expect(rejected.body).toBe('เคส CASE-26-0010 — เอกสารไม่ครบ')
  })

  it('ไม่มีเหตุผล = ไม่มีขีดคั่นห้อยท้าย', () => {
    const approved = caseDecisionMessage('case.approved', { caseId: 'c1', caseRef: 'CASE-26-0011', reason: null })
    expect(approved.body).toBe('เคส CASE-26-0011')
  })

  it('วันครบกำหนดตอบคำขอเปลี่ยนผู้รับผิดชอบแสดงเป็น พ.ศ.', () => {
    const message = reassignmentRequestedMessage({
      caseRef: 'CASE-26-0012',
      reason: null,
      expiresAt: new Date('2026-08-20T03:00:00Z'),
    })
    expect(message.body).toContain('20/08/2569')
    // UAT BUG-041 — ต้องมีเวลาด้วย (Asia/Bangkok) ไม่ใช่แค่วันที่
    expect(message.body).toContain('20/08/2569 10:00')
  })

  it('แจ้งเตือนงานมอบหมาย: พนักงานลิงก์ไปหน้า Field Tracker · ผู้มอบหมายลิงก์ไปหน้ามอบหมาย (UAT BUG-059)', () => {
    const notice = { caseRef: 'CASE-26-0017', pendingReassignmentId: 'p3' }
    expect(reassignmentTimeoutMessage(notice, 'new_agent').linkPath).toBe('/field/pending')
    expect(reassignmentTimeoutMessage(notice, 'previous_agent').linkPath).toBe('/field/closed')
    expect(reassignmentTimeoutMessage(notice, 'requester').linkPath).toBe('/cases/assign')
    // ข้อความของ 3 คนต้องต่างกัน — คนใหม่ต้องรู้ว่าได้เคสเพิ่ม
    const titles = new Set(
      (['new_agent', 'previous_agent', 'requester'] as const).map((audience) => reassignmentTimeoutMessage(notice, audience).title),
    )
    expect(titles.size).toBe(3)
    expect(assignmentCreatedMessage({ caseRef: 'CASE-26-0018', assignmentId: 'as4' }).linkPath).toBe('/field/pending')
    const accepted = assignmentAcceptedMessage({
      caseRef: 'CASE-26-0019',
      assignmentId: 'as5',
      agentName: null,
      acceptedAt: new Date('2026-10-03T09:39:00Z'),
    })
    expect(accepted.linkPath).toBe('/cases/assign')
    expect(accepted.body).toContain('03/10/2569 16:39')
  })

  it('ยอดเงินแสดงจาก satang เป็นบาท (ห้ามคำนวณเองที่หน้าจอ)', () => {
    expect(expenseApprovedMessage({ grossSatang: 125050, caseRef: null }).body).toContain('฿1,250.50')
    expect(expenseApprovedMessage({ grossSatang: 125050, caseRef: null }).body).not.toContain('(เคส')
  })

  it('ล็อตที่ยังไม่เกิดรายได้บอกตรง ๆ ว่ารออนุมัติค่าตอบแทน (`19` §6.1)', () => {
    const none = lotConfirmedMessage({
      lotId: 'l2',
      lotNumber: 'LOT-2569-002',
      companyName: 'เอ',
      assetCount: 1,
      revenueCount: 0,
    })
    expect(none.body).toContain('ยังไม่เกิดรายได้')
    expect(none.dedupeKey).toBe('lot-l2')
  })

  it('เงินทดรองเลยกำหนดส่งลิงก์คนละปลายทางตามผู้รับ แต่ใช้คีย์กันซ้ำตัวเดียวกัน', () => {
    const input = { advanceId: 'a9', dueClearDate: new Date('2026-08-10T00:00:00Z') }
    expect(advanceOverdueMessage(input, 'payee').linkPath).toBe('/field/advances')
    expect(advanceOverdueMessage(input, 'finance').linkPath).toBe('/finance?tab=advances')
    expect(advanceOverdueMessage(input, 'payee').dedupeKey).toBe(advanceOverdueMessage(input, 'finance').dedupeKey)
  })

  it('WHT: นับถอยหลัง/ครบกำหนดวันนี้/เลยกำหนด ใช้ข้อความคนละแบบ (`33` §6.2 มีโทษปรับ)', () => {
    const base = { summaryId: 's1', periodLabel: 'สิงหาคม 2569', filingDueDate: new Date('2026-09-15T00:00:00Z') }
    expect(whtFilingDueMessage({ ...base, daysLeft: 5 }).body).toContain('เหลือ 5 วัน')
    expect(whtFilingDueMessage({ ...base, daysLeft: 0 }).body).toContain('ครบกำหนดวันนี้')
    expect(whtFilingDueMessage({ ...base, daysLeft: -2 }).body).toContain('เลยกำหนดมาแล้ว 2 วัน')
  })

  it('U45 — ข้อความระบุวิธียื่น (ไม่ส่ง = ออนไลน์)', () => {
    const base = { summaryId: 's1', periodLabel: 'ตุลาคม 2569', daysLeft: 3 }
    expect(whtFilingDueMessage({ ...base, filingDueDate: new Date('2026-11-15T00:00:00Z') }).body).toContain(
      '15/11/2569 (ยื่นออนไลน์)',
    )
    expect(
      whtFilingDueMessage({ ...base, filingDueDate: new Date('2026-11-07T00:00:00Z'), filingMethod: 'paper' }).body,
    ).toContain('07/11/2569 (ยื่นแบบกระดาษ)')
  })
})

describe('clip()', () => {
  it('ข้อความว่าง/ช่องว่างล้วน = null', () => {
    expect(clip('   ')).toBeNull()
    expect(clip(null)).toBeNull()
  })

  it('ยาวเกินกำหนดถูกตัดพร้อมจุดไข่ปลา', () => {
    expect(clip('ก'.repeat(200))).toHaveLength(120)
    expect(clip('ก'.repeat(200))?.endsWith('…')).toBe(true)
  })
})

describe('ส่งหลักฐานใหม่หลังถูกตีกลับ — ข้อความแยก ไม่ส่งข้อความปิดงานซ้ำ (UAT BUG-071)', () => {
  const base = { caseRef: 'CASE-26-0004', agentName: 'สมชาย' }

  it('สายสำเร็จ + ทรัพย์ยังรอรับเข้า → แจ้งคลังด้วยหัวข้อ "ส่งหลักฐานใหม่แล้ว — <เลขเคส>"', () => {
    for (const assetStatus of ['pending_intake', 'intake_rejected']) {
      const notice = caseCloseResubmittedNotice({ ...base, outcome: 'closed_success', assetStatus })
      expect(notice?.capability).toBe('intake_asset')
      expect(notice?.message.title).toBe('ส่งหลักฐานใหม่แล้ว — CASE-26-0004')
      expect(notice?.message.eventCode).toBe('case.close_resubmitted')
      expect(notice?.message.title).not.toBe(caseClosedSuccessMessage(base).title)
    }
  })

  it('สายสำเร็จแต่รับเข้าคลังไปแล้ว / ไม่มีเครื่อง → ไม่แจ้ง', () => {
    for (const assetStatus of ['in_custody', 'handover_pending', 'handed_over', null]) {
      expect(caseCloseResubmittedNotice({ ...base, outcome: 'closed_success', assetStatus })).toBeNull()
    }
  })

  it('สายไม่สำเร็จ → แจ้งผู้มอบหมายของทีม', () => {
    const notice = caseCloseResubmittedNotice({ ...base, outcome: 'closed_fail', assetStatus: null })
    expect(notice?.capability).toBe('assign_case')
    expect(notice?.message.title).toBe('ส่งหลักฐานใหม่แล้ว — CASE-26-0004')
  })
})

describe('แจ้งผู้อนุมัติเมื่อรายการเข้าคิว (มติ PO U29)', () => {
  const base = {
    typeLabels: ['ค่าน้ำมัน', 'เบี้ยเสี่ยง'],
    requesterName: 'สมชาย',
    count: 2,
    totalSatang: 65_050,
    step: 1,
    totalSteps: 2,
    caseRefs: ['CASE-26-0008'],
    dedupeKey: 'expense-approval-abc',
  }

  it('รายการเบิก: บอกชนิด ผู้ขอ จำนวน ยอดรวม (฿ จาก satang) ขั้น + ลิงก์คิวค่าตอบแทน + คีย์กันซ้ำจากผู้เรียก', () => {
    const message = expenseApprovalRequestedMessage(base)
    expect(message.eventCode).toBe('expense.approval_requested')
    expect(message.title).toBe('รายการเบิกรออนุมัติ ขั้น 1/2')
    expect(message.body).toBe('ค่าน้ำมัน, เบี้ยเสี่ยง · ผู้ขอ สมชาย · 2 รายการ รวม ฿650.50 (เคส CASE-26-0008)')
    expect(message.linkPath).toBe('/finance?tab=comp')
    expect(message.dedupeKey).toBe('expense-approval-abc')
  })

  it('สายขั้นเดียวไม่โชว์เลขขั้น · ไม่ผูกเคสไม่มีวงเล็บ · เคสเกิน 2 สรุปจำนวนที่เหลือ', () => {
    expect(expenseApprovalRequestedMessage({ ...base, totalSteps: 1, caseRefs: [] }).title).toBe('รายการเบิกรออนุมัติ')
    expect(expenseApprovalRequestedMessage({ ...base, caseRefs: [] }).body).toBe(
      'ค่าน้ำมัน, เบี้ยเสี่ยง · ผู้ขอ สมชาย · 2 รายการ รวม ฿650.50',
    )
    expect(expenseApprovalRequestedMessage({ ...base, caseRefs: ['A', 'B', 'C', 'D'] }).body).toContain(
      '(เคส A, B และอีก 2 เคส)',
    )
  })

  it('เงินทดรอง: ยอด + วันเคลียร์ พ.ศ. + วัตถุประสงค์ · คีย์ผูก id', () => {
    const message = advanceApprovalRequestedMessage({
      advanceId: 'adv1',
      requesterName: 'สมหญิง',
      requestedSatang: 500_000,
      purpose: 'ค่าเดินทาง',
      dueClearDate: new Date('2026-10-20T00:00:00Z'),
    })
    expect(message.body).toBe('ผู้ขอ สมหญิง · ยอด ฿5,000.00 · เคลียร์ภายใน 20/10/2569 — ค่าเดินทาง')
    expect(message.linkPath).toBe('/finance?tab=advances')
    expect(message.dedupeKey).toBe('advance-approval-adv1')
  })

  it('Adjustment: คีย์ผูกชุดบทบาทที่รอ (บทบาทแรกอนุมัติแล้วแจ้งบทบาทถัดไปได้ ไม่ชนคีย์เดิม)', () => {
    const input = {
      adjustmentId: 'adj1',
      adjustmentTypeLabel: 'ลดยอด',
      amountSatang: 12_345,
      targetLabel: 'CASE-1 · รายได้',
      requesterName: 'การเงิน 1',
    }
    const both = adjustmentApprovalRequestedMessage({ ...input, waitingRoles: ['การเงิน', 'บริหาร'] })
    const exec = adjustmentApprovalRequestedMessage({ ...input, waitingRoles: ['บริหาร'] })
    expect(both.body).toBe('ลดยอด ฿123.45 · CASE-1 · รายได้ · ผู้ขอ การเงิน 1 — รออนุมัติจาก การเงิน + บริหาร')
    expect(both.dedupeKey).not.toBe(exec.dedupeKey)
    expect(exec.linkPath).toBe('/finance?tab=adjustment')
  })
})

describe('job รายวันเจองวดปิดแล้ว (มติ PO U25 · U50)', () => {
  it('บอกวันที่ พ.ศ. · พนักงาน · จำนวนเคส · ค่าน้ำมัน/เบี้ยเลี้ยง/รวม · ชี้ปุ่มเบิกย้อนหลัง · คีย์ต่อพนักงาน×วัน', () => {
    const message = fieldAllowancePeriodLockedMessage({
      agentId: 'u1',
      agentName: 'in1',
      fieldDate: new Date('2026-09-30T00:00:00Z'),
      caseCount: 2,
      fuelSatang: 30_000,
      allowanceSatang: 20_000,
    })
    expect(message.eventCode).toBe('field_allowance.period_locked')
    expect(message.body).toBe(
      'วันที่ 30/09/2569 คำนวณเข้างวดไม่ได้เพราะงวดบัญชีปิดแล้ว — in1 2 เคส ค่าน้ำมัน ฿300.00 เบี้ยเลี้ยง ฿200.00 รวม ฿500.00' +
        ' — กด "สร้างรายการเบิกย้อนหลัง" เพื่อลงรายการในงวดที่เปิดอยู่แล้วส่งเข้าสายอนุมัติ',
    )
    expect(message.linkPath).toBe('/finance?tab=adjustment')
    expect(message.dedupeKey).toBe('field-day-locked-u1-2026-09-30')
  })

  it('ฝั่งบัญชี: ข้อความรับทราบ + ลิงก์หน้าปิดงวด · คีย์เดียวกัน (กันซ้ำต่อผู้รับ)', () => {
    const input = {
      agentId: 'u1',
      agentName: 'in1',
      fieldDate: new Date('2026-09-30T00:00:00Z'),
      caseCount: 2,
      fuelSatang: 30_000,
      allowanceSatang: 20_000,
    }
    const accounting = fieldAllowancePeriodLockedMessage(input, 'accounting')
    expect(accounting.body).toContain('ฝ่ายการเงินจะสร้างรายการเบิกย้อนหลังลงในงวดที่เปิดอยู่')
    expect(accounting.linkPath).toBe('/accounting?tab=closing')
    expect(accounting.dedupeKey).toBe(fieldAllowancePeriodLockedMessage(input, 'finance').dedupeKey)
  })
})

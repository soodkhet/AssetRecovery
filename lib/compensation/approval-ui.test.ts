import { describe, expect, it } from 'vitest'
import { advanceExcessClaimNote } from '@/lib/advances/advance'
import { compensationBulkPreviewQuerySchema, compensationListQuerySchema } from '@/lib/compensation/approval-types'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import {
  approvalErrorToast,
  approvalHistoryLabel,
  approvalStepText,
  approvalStepTone,
  whtAmountHint,
  whtAmountLabel,
  claimSourceLabel,
  claimCaseRef,
  claimRefLabel,
  claimTypeLabel,
  CLAIM_STATUS_FILTERS,
  bulkApprovableIds,
  claimStatusLabel,
  bulkApproveSummary,
  isResubmittedClaim,
  matchesClaimStatusFilter,
  expenseRowActions,
  expenseRowHighlight,
  pendingClaimTotalSatang,
} from '@/lib/compensation/approval-ui'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'

function dto(overrides: Partial<CompensationApprovalDto> = {}): CompensationApprovalDto {
  return {
    id: 'exp-1',
    caseId: null,
    caseRef: 'CASE-26-0001',
    debtorName: null,
    agentName: 'พนักงาน ก',
    payeeId: 'payee-1',
    payeeName: 'พนักงาน ก',
    payeeVerified: true,
    payeeInfoIncomplete: false,
    expenseType: 'fuel',
    expenseDate: '2026-08-01',
    distanceKm: '128.50',
    calculationSource: 'compensation_plan',
    basisText: '128.50 กม. × 3.50 บาท/กม.',
    receiptInCompanyName: null,
    substituteReceipt: null,
    grossSatang: 45_000,
    whtSatang: 0,
    netSatang: 45_000,
    whtPctUsed: 0,
    whtRateSource: 'payee',
    whtWarning: null,
    whtPayerBorne: false,
    whtFromPayout: false,
    whtBelowThreshold: false,
    status: 'pending_approval',
    approvalStepCurrent: 1,
    approvalStepTotal: 2,
    pendingStepRole: 'ผู้จัดการทีมติดตามทรัพย์',
    approvalHistory: [],
    viewerCanAct: true,
    viewerCanRejectPermanently: false,
    rejectReason: null,
    note: null,
    resubmitNote: null,
    previousRejectReason: null,
    receiptFilePath: null,
    receiptUnverified: false,
    sharedWithName: null,
    recordedByName: null,
    createdAt: '2026-08-01T03:00:00.000Z',
    ...overrides,
  }
}

describe('ปุ่มบนแถว (`16` §8 — อ่านจาก state machine ห้าม if เอง)', () => {
  it('รายการในคิวอนุมัติ + มีสิทธิ์ = อนุมัติ/ตีกลับ/ดูสูตร', () => {
    expect(expenseRowActions({ status: 'pending_approval', canApprove: true })).toEqual([
      'approve',
      'reject',
      'view_formula',
    ])
    expect(expenseRowActions({ status: 'pending_finance_approval', canApprove: true })).toContain('approve')
  })

  it('ไม่มีสิทธิ์อนุมัติ = เหลือแค่ดูสูตร (ปุ่มหายไปเลย ไม่ใช่ปุ่มเทา)', () => {
    expect(expenseRowActions({ status: 'pending_approval', canApprove: false })).toEqual(['view_formula'])
  })

  it('สถานะที่ไม่อยู่ในคิว = เหลือแค่ดูสูตร', () => {
    for (const status of ['approved', 'rejected', 'needs_revision', 'superseded', 'pending_warehouse_confirm'] as ExpenseStatus[]) {
      expect(expenseRowActions({ status, canApprove: true })).toEqual(['view_formula'])
    }
  })
})

describe('มติ PO U117 ข้อ 3 — ปุ่ม "ปฏิเสธ" (ถาวร) ใบเบิกค่าที่พัก', () => {
  it('ค่าที่พัก pending_approval + มีสิทธิ์ = มีปุ่มปฏิเสธถาวร', () => {
    expect(expenseRowActions({ status: 'pending_approval', canApprove: true, expenseType: 'hotel' })).toEqual([
      'approve',
      'reject',
      'reject_permanent',
      'view_formula',
    ])
  })

  it('U118 — ขั้นการเงินมีปุ่มด้วย · ต้องแก้ไข = ปุ่มปฏิเสธอย่างเดียว (ตามสิทธิ์ของขั้นที่ตีกลับ)', () => {
    expect(expenseRowActions({ status: 'pending_finance_approval', canApprove: true, expenseType: 'hotel' })).toContain(
      'reject_permanent',
    )
    expect(
      expenseRowActions({ status: 'needs_revision', canApprove: true, expenseType: 'hotel', canRejectPermanent: true }),
    ).toEqual(['reject_permanent', 'view_formula'])
    expect(
      expenseRowActions({ status: 'needs_revision', canApprove: true, expenseType: 'hotel', canRejectPermanent: false }),
    ).toEqual(['view_formula'])
  })

  it('ชนิดอื่น / ไม่มีสิทธิ์ / จบแล้ว = ไม่มีปุ่ม', () => {
    expect(expenseRowActions({ status: 'pending_approval', canApprove: true, expenseType: 'receipt' })).not.toContain(
      'reject_permanent',
    )
    expect(expenseRowActions({ status: 'pending_approval', canApprove: false, expenseType: 'hotel' })).toEqual([
      'view_formula',
    ])
    for (const status of ['approved', 'rejected', 'superseded'] as ExpenseStatus[]) {
      expect(expenseRowActions({ status, canApprove: true, expenseType: 'hotel', canRejectPermanent: true })).toEqual([
        'view_formula',
      ])
    }
  })
})

describe('stepper ในแถว (`16` §8)', () => {
  it('กำลังรออนุมัติ = บอกขั้นและ role ที่รออยู่', () => {
    expect(approvalStepText(dto())).toBe('ขั้น 1/2: รอ ผู้จัดการทีมติดตามทรัพย์')
  })

  it('ยังไม่ได้ตั้งสายอนุมัติ = บอกให้รู้ ไม่ใช่เงียบ', () => {
    expect(approvalStepText(dto({ pendingStepRole: null }))).toContain('ยังไม่ได้ตั้งสายอนุมัติ')
  })

  it('รายการที่จบแล้วบอกผลแทนเลขขั้น', () => {
    expect(approvalStepText(dto({ status: 'approved' }))).toBe('✓ ผ่านทุกขั้น')
    expect(approvalStepText(dto({ status: 'rejected' }))).toBe('✗ ปฏิเสธ')
    expect(approvalStepText(dto({ status: 'needs_revision' }))).toContain('กลับไปขั้น 1')
    expect(approvalStepText(dto({ status: 'pending_warehouse_confirm' }))).toContain('รอคลังยืนยัน')
  })

  it('สีของ stepper มาจาก 10 กลุ่มของ `04` §8.1', () => {
    expect(approvalStepTone('approved')).toBe('success')
    expect(approvalStepTone('rejected')).toBe('critical')
    expect(approvalStepTone('needs_revision')).toBe('warning')
    expect(approvalStepTone('pending_approval')).toBe('neutral')
  })

  it('บรรทัดประวัติอนุมัติบอกขั้น + role + สัญลักษณ์ผล', () => {
    const label = approvalHistoryLabel(
      { step: 1, approverId: 'u1', approverRole: 'การเงิน', action: 'approve', timestamp: '', reason: null },
      2,
    )
    expect(label).toBe('✓ ขั้น 1/2: การเงิน')
  })
})

describe('mytester3 F3-03 — ป้ายสถานะของรายการที่รอขั้นบริหาร', () => {
  it('ขั้น 3/3 รอบริหาร ⇒ "รอผู้บริหารอนุมัติ" (enum คงเป็น pending_finance_approval)', () => {
    const item = dto({ status: 'pending_finance_approval', approvalStepCurrent: 3, approvalStepTotal: 3, pendingStepRole: 'บริหาร' })
    expect(claimStatusLabel(item)).toBe('รอผู้บริหารอนุมัติ')
    expect(approvalStepText(item)).toBe('ขั้น 3/3: รอ บริหาร')
  })

  it('ขั้นการเงิน ⇒ ป้ายเดิม "รอการเงินอนุมัติ"', () => {
    expect(claimStatusLabel(dto({ status: 'pending_finance_approval', pendingStepRole: 'การเงิน' }))).toBe('รอการเงินอนุมัติ')
  })

  it('สถานะอื่น/ไม่มีสายอนุมัติ ⇒ ป้ายตาม enum', () => {
    expect(claimStatusLabel(dto({ status: 'pending_approval', pendingStepRole: 'บริหาร' }))).toBe('รออนุมัติจ่าย')
    expect(claimStatusLabel(dto({ status: 'pending_finance_approval', pendingStepRole: null }))).toBe('รอการเงินอนุมัติ')
  })
})

describe('ที่มาของรายการ (`15` §8)', () => {
  it('รายการที่คิดจากแผนค่าตอบแทน = อัตโนมัติ', () => {
    expect(claimSourceLabel('compensation_plan')).toContain('อัตโนมัติ')
  })

  it('รายการที่กรอกเอง/ตามใบเสร็จ = บันทึกเอง', () => {
    expect(claimSourceLabel('manual')).toContain('บันทึกเอง')
    expect(claimSourceLabel('receipt')).toContain('บันทึกเอง')
  })

  it('mytester F-08 — คำขอเบิกส่วนเกินที่ระบบสร้างจากเงินทดรอง = อ้างเลข ADV ไม่ใช่ "บันทึกเอง"', () => {
    const note = advanceExcessClaimNote({
      purpose: 'ค่าเดินทาง',
      approvedSatang: 400_000,
      usedSatang: 450_000,
      advanceNumber: 'ADV-2569-0003',
    })
    const label = claimSourceLabel('manual', note)
    expect(label).toContain('ส่วนเกินเงินทดรอง ADV-2569-0003')
    expect(label).not.toContain('บันทึกเอง')
    // หมายเหตุรุ่นเก่า (ไม่มีเลข ADV) ยังบอกที่มาได้
    expect(claimSourceLabel('manual', advanceExcessClaimNote({ purpose: 'x', approvedSatang: 1, usedSatang: 2 }))).toBe(
      '↪ ส่วนเกินเงินทดรอง',
    )
    expect(claimSourceLabel('manual', 'ค่าทางด่วน')).toContain('บันทึกเอง')
  })
})

describe('รายละเอียดตาราง', () => {
  it('แถวที่ถูกตีกลับถูกเน้นพื้นหลัง', () => {
    expect(expenseRowHighlight('needs_revision')).toBe('bg-orange-50/30')
    expect(expenseRowHighlight('approved')).toBeNull()
  })

  it('ตัวกรอง 7 ตัวตรงกับค่าที่ API รับ (รวม "รอคลัง" — E-037 · "รอผู้บริหารอนุมัติ" — known)', () => {
    expect(CLAIM_STATUS_FILTERS.map((filter) => filter.value)).toEqual([
      'all',
      'pending_approval',
      'pending_finance_approval',
      'pending_executive',
      'needs_revision',
      'approved',
      'pending_warehouse_confirm',
    ])
    for (const filter of CLAIM_STATUS_FILTERS) {
      expect(compensationListQuerySchema.safeParse({ status: filter.value }).success).toBe(true)
    }
  })

  it('E-037 — แถวรอคลังเป็นแถวอ่านอย่างเดียว (ไม่มีปุ่มอนุมัติ/ตีกลับ/ปฏิเสธ)', () => {
    expect(
      expenseRowActions({ status: 'pending_warehouse_confirm', canApprove: true, expenseType: 'hotel' }),
    ).toEqual(['view_formula'])
  })

  it('ยอดรออนุมัติรวมนับเฉพาะรายการที่ยังอยู่ในคิวจริง', () => {
    const total = pendingClaimTotalSatang([
      dto({ id: 'a', status: 'pending_approval', grossSatang: 10_000 }),
      dto({ id: 'b', status: 'pending_finance_approval', grossSatang: 20_000 }),
      dto({ id: 'c', status: 'approved', grossSatang: 90_000 }),
      dto({ id: 'd', status: 'needs_revision', grossSatang: 50_000 }),
    ])
    expect(total).toBe(30_000)
  })
})

describe('approvalErrorToast — EXPENSE_INVALID_STATUS จากแท็บเก่า (staging S-014)', () => {
  const base = { code: 'EXPENSE_INVALID_STATUS', title: 'สถานะรายการเบิกไม่ถูกต้อง', message: 'm' }

  it('มีคนทำไปแล้ว → บอกสถานะล่าสุด + stale (โหลดคิวใหม่)', () => {
    const toast = approvalErrorToast({ ...base, payload: { ...base, status: 'approved', action: 'approve' } })
    expect(toast.stale).toBe(true)
    expect(toast.title).toBe('รายการนี้ถูกดำเนินการไปแล้ว')
    expect(toast.message).toContain('สถานะล่าสุด')
  })

  it('ไม่มีสถานะแนบมา (ชนกันระหว่างทาง) → ยัง stale แต่ไม่ระบุสถานะ', () => {
    const toast = approvalErrorToast(base)
    expect(toast.stale).toBe(true)
    expect(toast.message).not.toContain('สถานะล่าสุด')
  })

  it('ปฏิเสธถาวรผิดประเภท (มี expenseType) → ข้อความจาก API ตรงๆ', () => {
    expect(approvalErrorToast({ ...base, payload: { ...base, status: 'pending_manager_approval', expenseType: 'commission' } }).stale).toBe(false)
  })
})

describe('approvalErrorToast — ทิศของ APPROVAL_STEP_OUT_OF_ORDER (BUG-105)', () => {
  const base = { code: 'APPROVAL_STEP_OUT_OF_ORDER', title: 'อนุมัติข้ามขั้น', message: 'รายการนี้ยังไม่ถึงขั้นอนุมัติของคุณ' }
  const payload = (requestedStep: number, currentStep: number) => ({ ...base, requestedStep, currentStep })

  it('ขั้นที่ขอ < ขั้นปัจจุบัน (หน้าค้าง) → "ผ่านขั้นของคุณแล้ว — รีเฟรชหน้า"', () => {
    expect(approvalErrorToast({ ...base, payload: payload(1, 2) })).toEqual({
      title: 'รายการนี้ผ่านขั้นของคุณแล้ว',
      message: 'รายการนี้ผ่านขั้นของคุณแล้ว — รีเฟรชหน้า',
      stale: true,
    })
  })

  it('ขั้นที่ขอ > ขั้นปัจจุบัน → ข้อความเดิม "ยังไม่ถึงขั้น"', () => {
    expect(approvalErrorToast({ ...base, payload: payload(3, 2) })).toEqual({
      title: base.title,
      message: base.message,
      stale: false,
    })
  })

  it('ไม่มีรายละเอียดขั้น หรือ code อื่น → ข้อความจาก API ตรงๆ', () => {
    expect(approvalErrorToast(base).stale).toBe(false)
    expect(approvalErrorToast({ code: 'SEGREGATION_OF_DUTIES_VIOLATION', title: 't', message: 'm' })).toEqual({
      title: 't',
      message: 'm',
      stale: false,
    })
  })
})

describe('whtAmountHint — ต่ำกว่าเกณฑ์ (staging E-039)', () => {
  const pct = (value: number): string => `${value.toFixed(2)}%`
  it('อัตรา 3% แต่ไม่หัก ⇒ บอกว่าต่ำกว่าเกณฑ์ และเกณฑ์จริงเทียบยอดรวมในรอบจ่าย', () => {
    const hint = whtAmountHint(
      { whtPctUsed: 3, whtRateSource: 'type_default', whtPayerBorne: false, whtFromPayout: false, whtBelowThreshold: true },
      pct,
    )
    expect(hint).toContain('3.00%')
    expect(hint).toContain('ต่ำกว่าเกณฑ์ขั้นต่ำ')
  })
  it('ถึงเกณฑ์ ⇒ ไม่มีข้อความต่ำกว่าเกณฑ์', () => {
    const hint = whtAmountHint(
      { whtPctUsed: 3, whtRateSource: 'payee', whtPayerBorne: false, whtFromPayout: false, whtBelowThreshold: false },
      pct,
    )
    expect(hint).not.toContain('ต่ำกว่าเกณฑ์')
  })
})

describe('อนุมัติหลายรายการ + ป้ายส่งใหม่ (staging E-045)', () => {
  it('เลือกได้เฉพาะแถวที่ผู้ใช้อนุมัติได้อยู่แล้ว · สรุปยอดรวม', () => {
    const items = [
      dto({ id: 'a', status: 'pending_approval', viewerCanAct: true, grossSatang: 10_000, netSatang: 9_700 }),
      dto({ id: 'b', status: 'pending_approval', viewerCanAct: false, grossSatang: 20_000 }),
      dto({ id: 'c', status: 'approved', viewerCanAct: true, grossSatang: 30_000 }),
      dto({ id: 'd', status: 'pending_finance_approval', viewerCanAct: true, grossSatang: 5_000, netSatang: 5_000 }),
    ]
    expect(bulkApprovableIds(items, true)).toEqual(['a', 'd'])
    expect(bulkApprovableIds(items, false)).toEqual([])
    expect(bulkApproveSummary([items[0]!, items[3]!])).toEqual({ count: 2, grossSatang: 15_000, netSatang: 14_700 })
  })

  it('ป้าย "ส่งใหม่" เฉพาะรายการที่รออนุมัติและมีคำชี้แจงตอนส่งใหม่', () => {
    expect(isResubmittedClaim({ status: 'pending_approval', resubmitNote: 'แนบใบเสร็จใหม่แล้ว' })).toBe(true)
    expect(isResubmittedClaim({ status: 'pending_approval', resubmitNote: null })).toBe(false)
    expect(isResubmittedClaim({ status: 'approved', resubmitNote: 'x' })).toBe(false)
  })
})

describe('mytester2 F2-01 — ป้ายยอดภาษีบนแถวบอกว่าเป็นประมาณการเมื่อยังไม่เข้ารอบจ่าย', () => {
  it('ยังไม่เข้ารอบ = "(ประมาณการ)" · เข้ารอบแล้ว = ป้ายเดิม · บริษัทออกให้คงข้อความเดิม', () => {
    expect(whtAmountLabel({ whtPayerBorne: false, whtFromPayout: false })).toBe('WHT (ประมาณการ)')
    expect(whtAmountLabel({ whtPayerBorne: false, whtFromPayout: true })).toBe('WHT')
    expect(whtAmountLabel({ whtPayerBorne: true, whtFromPayout: false })).toBe('ภาษีที่บริษัทออกให้ (ประมาณการ)')
    expect(whtAmountLabel({ whtPayerBorne: true })).toBe('ภาษีที่บริษัทออกให้')
  })
})

describe('mytester2 F2-01 — query ของยอดสรุป "อนุมัติที่เลือก"', () => {
  const A = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
  const B = '3fa85f64-5717-4562-b3fc-2c963f66afa7'
  it('ids คั่นจุลภาค ตัดซ้ำ/ช่องว่าง · ว่าง/รหัสผิดรูป = ไม่ผ่าน', () => {
    expect(compensationBulkPreviewQuerySchema.parse({ ids: `${A}, ${B},${A}` }).ids).toEqual([A, B])
    expect(compensationBulkPreviewQuerySchema.safeParse({ ids: '' }).success).toBe(false)
    expect(compensationBulkPreviewQuerySchema.safeParse({ ids: 'abc' }).success).toBe(false)
    expect(compensationBulkPreviewQuerySchema.safeParse({}).success).toBe(false)
  })
})

describe('known — ตัวกรองคิว "รอผู้บริหารอนุมัติ"', () => {
  const exec = dto({ status: 'pending_finance_approval', approvalStepCurrent: 3, approvalStepTotal: 3, pendingStepRole: 'บริหาร' })
  const fin = dto({ status: 'pending_finance_approval', pendingStepRole: 'การเงิน' })
  const mgr = dto({ status: 'pending_approval', pendingStepRole: 'บริหาร' })

  it('รอผู้บริหาร = เฉพาะ pending_finance_approval ที่ขั้นที่รออยู่เป็นบริหาร', () => {
    expect([exec, fin, mgr].filter((item) => matchesClaimStatusFilter('pending_executive', item))).toEqual([exec])
  })
  it('รอขั้น 2 (การเงิน) ไม่รวมขั้นบริหาร · ทั้งหมด = ทุกแถว · สถานะอื่นเทียบตรง', () => {
    expect([exec, fin, mgr].filter((item) => matchesClaimStatusFilter('pending_finance_approval', item))).toEqual([fin])
    expect([exec, fin, mgr].filter((item) => matchesClaimStatusFilter('all', item))).toHaveLength(3)
    expect([exec, fin, mgr].filter((item) => matchesClaimStatusFilter('pending_approval', item))).toEqual([mgr])
  })
  it('ตัวเลือกบนหน้าจอมี "รอผู้บริหารอนุมัติ" และ API รับค่าเดียวกัน', () => {
    expect(CLAIM_STATUS_FILTERS.map((option) => option.label)).toContain('รอผู้บริหารอนุมัติ')
    expect(compensationListQuerySchema.parse({ status: 'pending_executive' }).status).toBe('pending_executive')
  })
})

describe('mytester F5-03 — เลขเคสอ้างอิงของใบเบิกส่วนเกินเงินทดรอง (คิวผู้จัดการ/แท็บค่าตอบแทน/รายละเอียด)', () => {
  const note = advanceExcessClaimNote({
    purpose: 'ค่าเดินทาง',
    approvedSatang: 400_000,
    usedSatang: 438_075,
    advanceNumber: 'ADV-2569-0002',
    caseRef: 'NDP/2569/MT5-04',
  })

  it('ส่วนเกินที่เงินทดรองอ้างอิงเคส ⇒ เลขเคสจากหมายเหตุ · ผูกเคสตรง ⇒ เคสของรายการ · ไม่มีทั้งคู่ ⇒ null', () => {
    expect(claimCaseRef({ caseRef: null, note })).toBe('NDP/2569/MT5-04')
    expect(claimCaseRef({ caseRef: 'C-1', note })).toBe('C-1')
    expect(claimCaseRef({ caseRef: null, note: 'บันทึกเอง' })).toBeNull()
    expect(claimRefLabel({ caseRef: null, note: null })).toBe('— ไม่ผูกเคส')
    expect(claimTypeLabel({ expenseType: 'manual', note })).toBe('ส่วนเกินเงินทดรอง ADV-2569-0002')
  })
})

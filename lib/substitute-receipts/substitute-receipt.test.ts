import { describe, expect, it } from 'vitest'
import {
  emptySubstituteLine,
  fitSubstituteLinesToTotal,
  substituteDraftPayload,
  substituteLineInputId,
  substituteLineRowError,
  substituteLinesToDrafts,
} from '@/lib/substitute-receipts/form'
import { resubmitExpenseSchema } from '@/lib/field/schemas'
import { SubstituteReceiptError } from '@/lib/substitute-receipts/errors'
import { substituteReceiptDraftSchema, substituteReceiptLineSchema } from '@/lib/substitute-receipts/schemas'
import {
  assertWithinSubstituteReceiptLimits,
  canCancelSubstituteReceipt,
  canUploadSignedSubstituteReceipt,
  canViewSubstituteReceipt,
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG,
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG,
  hasActiveSubstituteReceipt,
  isSubstituteReceiptActive,
  isSubstituteReceiptRefActive,
  requireSubstituteReceiptCancelReason,
  resubmitEvidenceDecision,
  type ResubmitEvidenceInput,
  substituteReceiptBadgeText,
  substituteReceiptCancelProblem,
  substituteReceiptCancelProblemMessage,
  substituteReceiptReissueTotalProblem,
  substituteReceiptResubmitProblem,
  substituteReceiptStatusBadgeGroup,
  SUBSTITUTE_RECEIPT_STATUS_LABEL,
  substituteReceiptCertification,
  substituteReceiptLimitMessage,
  substituteReceiptLimitProblem,
  substituteReceiptMonthRange,
  substituteReceiptPerDocWarning,
  substituteReceiptTotalSatang,
  SUBSTITUTE_RECEIPT_MAX_LINES,
  type SubstituteReceiptViewer,
} from '@/lib/substitute-receipts/substitute-receipt'

const LIMITS = {
  maxPerDocSatang: DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG,
  maxPerMonthSatang: DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG,
}

describe('ยอดรวมใบรับรองแทนใบเสร็จ (22 §6.17)', () => {
  it('รวมยอดทุกบรรทัดเป็นสตางค์จำนวนเต็ม (ตัวอย่าง mockup 5 บรรทัด = ฿260)', () => {
    expect(
      substituteReceiptTotalSatang([
        { amountSatang: 7000 },
        { amountSatang: 4000 },
        { amountSatang: 6000 },
        { amountSatang: 2000 },
        { amountSatang: 7000 },
      ]),
    ).toBe(26000)
  })

  it('ไม่มีบรรทัด / ยอด 0 / ติดลบ / มีทศนิยม = ปฏิเสธ', () => {
    expect(() => substituteReceiptTotalSatang([])).toThrow(RangeError)
    expect(() => substituteReceiptTotalSatang([{ amountSatang: 0 }])).toThrow(RangeError)
    expect(() => substituteReceiptTotalSatang([{ amountSatang: -100 }])).toThrow(RangeError)
    expect(() => substituteReceiptTotalSatang([{ amountSatang: 10.5 }])).toThrow(RangeError)
  })
})

describe('เพดานต่อใบ / ต่อคนต่อเดือน', () => {
  it('ค่าเริ่มต้น ฿500 ต่อใบ และ ฿3,000 ต่อเดือน', () => {
    expect(DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG).toBe(50_000)
    expect(DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG).toBe(300_000)
  })

  it('เท่าเพดานพอดีผ่านทั้งสองชั้น', () => {
    expect(substituteReceiptLimitProblem({ ...LIMITS, totalSatang: 50_000, monthUsedSatang: 250_000 })).toBeNull()
  })

  it('เกินเพดานต่อใบ 1 สตางค์ = บล็อก (ตรวจก่อนต่อเดือน)', () => {
    expect(substituteReceiptLimitProblem({ ...LIMITS, totalSatang: 50_001, monthUsedSatang: 300_000 })).toEqual({
      kind: 'per_doc',
      limitSatang: 50_000,
      totalSatang: 50_001,
    })
  })

  it('ยอดเดือนสะสม + ใบนี้เกินเพดานต่อเดือน = บล็อก พร้อมยอดที่ยังออกได้', () => {
    expect(substituteReceiptLimitProblem({ ...LIMITS, totalSatang: 30_000, monthUsedSatang: 280_000 })).toEqual({
      kind: 'per_month',
      limitSatang: 300_000,
      totalSatang: 30_000,
      monthUsedSatang: 280_000,
      remainingSatang: 20_000,
    })
  })

  it('ลดเพดานต่อเดือนลงต่ำกว่ายอดที่ใช้ไปแล้ว — ยอดคงเหลือเป็น 0 ไม่ติดลบ', () => {
    const problem = substituteReceiptLimitProblem({ ...LIMITS, maxPerMonthSatang: 100_000, totalSatang: 100, monthUsedSatang: 150_000 })
    expect(problem).toMatchObject({ kind: 'per_month', remainingSatang: 0 })
  })

  it('assert เกินเพดาน = SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT (400) พร้อมข้อความบอกยอด', () => {
    try {
      assertWithinSubstituteReceiptLimits({ ...LIMITS, totalSatang: 60_000, monthUsedSatang: 0 })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SubstituteReceiptError)
      const typed = error as SubstituteReceiptError
      expect(typed.code).toBe('SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT')
      expect(typed.status).toBe(400)
      expect(typed.userMessage).toContain('฿500.00')
      expect(typed.userMessage).toContain('฿600.00')
    }
    expect(() => assertWithinSubstituteReceiptLimits({ ...LIMITS, totalSatang: 100, monthUsedSatang: 0 })).not.toThrow()
  })

  it('ข้อความต่อเดือนบอกยอดที่ใช้แล้ว เพดาน และยอดที่ยังออกได้ — ไม่มีเลขอ้างอิงสเปค', () => {
    const message = substituteReceiptLimitMessage({
      kind: 'per_month',
      limitSatang: 300_000,
      totalSatang: 30_000,
      monthUsedSatang: 280_000,
      remainingSatang: 20_000,
    })
    expect(message).toContain('฿2,800.00')
    expect(message).toContain('฿3,000.00')
    expect(message).toContain('฿200.00')
    expect(message).not.toMatch(/§|ไฟล์ \d/)
  })

  it('คำเตือนล่วงหน้าบนฟอร์มดูแค่เพดานต่อใบ', () => {
    expect(substituteReceiptPerDocWarning(50_000, 50_000)).toBeNull()
    expect(substituteReceiptPerDocWarning(50_100, 50_000)).toContain('เกินเพดานต่อใบ')
  })
})

describe('เดือนของวันที่ออกใบ', () => {
  it('คืนช่วง [วันที่ 1, วันที่ 1 ของเดือนถัดไป) ของคอลัมน์ DATE', () => {
    const range = substituteReceiptMonthRange(new Date(Date.UTC(2026, 9, 31)))
    expect(range.start.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('ข้ามปี (ธันวาคม → มกราคม)', () => {
    const range = substituteReceiptMonthRange(new Date(Date.UTC(2026, 11, 15)))
    expect(range.end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('ป้าย/คำรับรอง', () => {
  it('ป้ายคิวอนุมัติ', () => {
    expect(substituteReceiptBadgeText('CRT-2569-0009')).toBe('ใบรับรองแทนใบเสร็จ CRT-2569-0009')
  })

  it('คำรับรองระบุชื่อผู้จ่ายเงิน', () => {
    expect(substituteReceiptCertification('นายทดสอบ ภาคสนาม')).toContain('ข้าพเจ้า นายทดสอบ ภาคสนาม (ผู้เบิกจ่าย)')
  })
})

describe('scope การเห็น/อัปโหลด', () => {
  const base: SubstituteReceiptViewer = {
    userId: 'u-other',
    isSuperadmin: false,
    canSeeAllAdvances: false,
    canSeeAllExpenses: false,
    canManageAllAdvances: false,
    canManageAllExpenses: false,
    managedTeamIds: [],
  }
  const expenseOwner = { payeeUserId: 'u-owner', payeeTeamId: 't1', link: 'expense' as const }
  const advanceOwner = { ...expenseOwner, link: 'advance' as const }

  it('เจ้าของเห็นและอัปโหลดได้ · คนอื่นไม่ได้', () => {
    const owner = { ...base, userId: 'u-owner' }
    expect(canViewSubstituteReceipt(owner, expenseOwner)).toBe(true)
    expect(canUploadSignedSubstituteReceipt(owner, advanceOwner)).toBe(true)
    expect(canViewSubstituteReceipt(base, expenseOwner)).toBe(false)
    expect(canUploadSignedSubstituteReceipt(base, expenseOwner)).toBe(false)
  })

  it('การเงิน (เงินทดรอง) เห็นใบของเงินทดรองแต่ไม่เห็นใบของใบเบิก', () => {
    const finance = { ...base, canSeeAllAdvances: true }
    expect(canViewSubstituteReceipt(finance, advanceOwner)).toBe(true)
    expect(canViewSubstituteReceipt(finance, expenseOwner)).toBe(false)
  })

  it('ผู้จัดการทีมเห็นใบเบิกของทีมที่ดูแลแต่อัปโหลดแทนไม่ได้', () => {
    const manager = { ...base, managedTeamIds: ['t1'] }
    expect(canViewSubstituteReceipt(manager, expenseOwner)).toBe(true)
    expect(canViewSubstituteReceipt(manager, { ...expenseOwner, payeeTeamId: 't2' })).toBe(false)
    expect(canUploadSignedSubstituteReceipt(manager, expenseOwner)).toBe(false)
  })

  it('Superadmin เห็นทุกใบ', () => {
    expect(canViewSubstituteReceipt({ ...base, isSuperadmin: true }, advanceOwner)).toBe(true)
  })
})

describe('Zod schema (FE/BE ชุดเดียว)', () => {
  const line = { lineDate: '2026-10-03', description: 'ค่าผ่านทางพิเศษ', amountSatang: 7000, note: '' }

  it('แปลงวันที่เป็นเที่ยงคืน UTC และหมายเหตุว่าง = null', () => {
    const parsed = substituteReceiptLineSchema.parse(line)
    expect(parsed.lineDate.toISOString()).toBe('2026-10-03T00:00:00.000Z')
    expect(parsed.note).toBeNull()
  })

  it('ยอด 0 / รายละเอียดสั้น / ไม่มีบรรทัด / เกินจำนวนบรรทัด = ไม่ผ่าน', () => {
    expect(substituteReceiptLineSchema.safeParse({ ...line, amountSatang: 0 }).success).toBe(false)
    expect(substituteReceiptLineSchema.safeParse({ ...line, description: 'ab' }).success).toBe(false)
    expect(substituteReceiptDraftSchema.safeParse({ lines: [] }).success).toBe(false)
    expect(
      substituteReceiptDraftSchema.safeParse({ lines: Array.from({ length: SUBSTITUTE_RECEIPT_MAX_LINES + 1 }, () => line) })
        .success,
    ).toBe(false)
  })
})

describe('มติ PO U107 — ยกเลิก / ออกใบใหม่แทน (23 §6.17)', () => {
  const expenseLink = (overrides: Partial<{ expenseStatus: 'pending_approval' | 'approved' | 'rejected' | 'needs_revision'; inCompletedPayout: boolean }> = {}) => ({
    kind: 'expense' as const,
    expenseStatus: 'pending_approval' as const,
    expenseType: 'hotel' as const,
    expenseGrossSatang: 10_000,
    inCompletedPayout: false,
    ...overrides,
  })

  it('สถานะ/ป้าย: ยกเลิก = แดง · ใบที่ใช้งานอยู่ = ไม่ใช่ cancelled', () => {
    expect(SUBSTITUTE_RECEIPT_STATUS_LABEL.cancelled).toBe('ยกเลิกแล้ว')
    expect(substituteReceiptStatusBadgeGroup('cancelled')).toBe('critical')
    expect(isSubstituteReceiptActive('cancelled')).toBe(false)
    expect(isSubstituteReceiptActive('signed')).toBe(true)
    expect(isSubstituteReceiptActive('pending_signature')).toBe(true)
  })

  it('ยกเลิกได้: รอเซ็น/เซ็นแล้ว ของใบเบิกที่ยังไม่อนุมัติ (รวมถูกปฏิเสธ/ตีกลับ) และของเงินทดรอง', () => {
    expect(substituteReceiptCancelProblem('pending_signature', expenseLink())).toBeNull()
    expect(substituteReceiptCancelProblem('signed', expenseLink({ expenseStatus: 'needs_revision' }))).toBeNull()
    expect(substituteReceiptCancelProblem('signed', expenseLink({ expenseStatus: 'rejected' }))).toBeNull()
    expect(substituteReceiptCancelProblem('signed', { kind: 'advance', usedSatang: 10_000 })).toBeNull()
  })

  it('ยกเลิกไม่ได้: ยกเลิกแล้ว (terminal) · ใบเบิกอนุมัติจ่ายแล้ว · อยู่ในรอบจ่ายที่จ่ายแล้ว', () => {
    expect(substituteReceiptCancelProblem('cancelled', expenseLink())).toBe('already_cancelled')
    expect(substituteReceiptCancelProblem('signed', expenseLink({ expenseStatus: 'approved' }))).toBe('linked_paid')
    expect(substituteReceiptCancelProblem('signed', expenseLink({ inCompletedPayout: true }))).toBe('linked_paid')
    expect(substituteReceiptCancelProblemMessage('linked_paid', 'CRT-2569-0001')).toContain('อนุมัติจ่ายแล้ว')
    expect(substituteReceiptCancelProblemMessage('already_cancelled', 'CRT-2569-0001')).toContain('ถูกยกเลิกไปแล้ว')
  })

  it('เหตุผลบังคับอย่างน้อย 5 ตัวอักษร (ตัดช่องว่าง) — ไม่ผ่าน = CANCEL_REQUIRES_REASON', () => {
    expect(requireSubstituteReceiptCancelReason('  กรอกผิดวัน  ')).toBe('กรอกผิดวัน')
    for (const reason of [null, undefined, '', '    ', 'ผิด']) {
      expect(() => requireSubstituteReceiptCancelReason(reason)).toThrow(SubstituteReceiptError)
    }
    try {
      requireSubstituteReceiptCancelReason('')
    } catch (error) {
      expect((error as SubstituteReceiptError).code).toBe('CANCEL_REQUIRES_REASON')
    }
  })

  it('สิทธิ์ยกเลิก: เจ้าของ (ใบเบิก) · การเงินของสายนั้น · Superadmin — ผู้จัดการทีม/เจ้าของใบเงินทดรองไม่ได้', () => {
    const base = {
      userId: 'u-other',
      isSuperadmin: false,
      canSeeAllAdvances: false,
      canSeeAllExpenses: false,
      canManageAllAdvances: false,
      canManageAllExpenses: false,
      managedTeamIds: ['t1'],
    }
    const expenseOwner = { payeeUserId: 'u-owner', payeeTeamId: 't1', link: 'expense' as const }
    const advanceOwner = { ...expenseOwner, link: 'advance' as const }
    expect(canCancelSubstituteReceipt({ ...base, userId: 'u-owner' }, expenseOwner)).toBe(true)
    expect(canCancelSubstituteReceipt({ ...base, userId: 'u-owner' }, advanceOwner)).toBe(false)
    expect(canCancelSubstituteReceipt(base, expenseOwner)).toBe(false) // ผู้จัดการทีมดูได้อย่างเดียว
    const financeExp = { ...base, canSeeAllExpenses: true, canManageAllExpenses: true }
    const financeAdv = { ...base, canSeeAllAdvances: true, canManageAllAdvances: true }
    expect(canCancelSubstituteReceipt(financeExp, expenseOwner)).toBe(true)
    expect(canCancelSubstituteReceipt(financeExp, advanceOwner)).toBe(false)
    expect(canCancelSubstituteReceipt(financeAdv, advanceOwner)).toBe(true)
    expect(canCancelSubstituteReceipt({ ...base, isSuperadmin: true }, advanceOwner)).toBe(true)
  })

  it('Final ด่าน 4: ถือสิทธิ์ระดับ view ทั้งองค์กร = ดูได้อย่างเดียว ยกเลิก/ออกใหม่/อัปโหลดฉบับเซ็นแทนไม่ได้ (DEC-009)', () => {
    const viewOnly = {
      userId: 'u-other',
      isSuperadmin: false,
      canSeeAllAdvances: true,
      canSeeAllExpenses: true,
      canManageAllAdvances: false,
      canManageAllExpenses: false,
      managedTeamIds: [],
    }
    const expenseOwner = { payeeUserId: 'u-owner', payeeTeamId: 't1', link: 'expense' as const }
    const advanceOwner = { ...expenseOwner, link: 'advance' as const }
    expect(canViewSubstituteReceipt(viewOnly, expenseOwner)).toBe(true)
    expect(canViewSubstituteReceipt(viewOnly, advanceOwner)).toBe(true)
    expect(canCancelSubstituteReceipt(viewOnly, expenseOwner)).toBe(false)
    expect(canCancelSubstituteReceipt(viewOnly, advanceOwner)).toBe(false)
    expect(canUploadSignedSubstituteReceipt(viewOnly, expenseOwner)).toBe(false)
    expect(canUploadSignedSubstituteReceipt(viewOnly, advanceOwner)).toBe(false)
  })

  it('ยอดใบใหม่: ค่าที่พัก = ยอดเบิกพอดี · ชนิดอื่นไม่เกินยอดเบิก · เงินทดรองไม่เกินยอดใช้จริง', () => {
    expect(substituteReceiptReissueTotalProblem(expenseLink(), 10_000)).toBeNull()
    expect(substituteReceiptReissueTotalProblem(expenseLink(), 9_000)).toContain('เท่ากับยอดเบิก')
    const receiptLink = { ...expenseLink(), expenseType: 'receipt' as const }
    expect(substituteReceiptReissueTotalProblem(receiptLink, 9_000)).toBeNull()
    expect(substituteReceiptReissueTotalProblem(receiptLink, 10_001)).toContain('ไม่เกินยอดเบิก')
    expect(substituteReceiptReissueTotalProblem({ kind: 'advance', usedSatang: 5_000 }, 5_000)).toBeNull()
    expect(substituteReceiptReissueTotalProblem({ kind: 'advance', usedSatang: 5_000 }, 5_001)).toContain('ยอดที่ใช้จริง')
    expect(substituteReceiptReissueTotalProblem({ kind: 'advance', usedSatang: null }, 1)).not.toBeNull()
  })

  it('staging SV5-01 — ส่งใหม่ขณะมีใบที่ใช้งานอยู่: ค่าที่พักยอดต้องเท่าใบ · ชนิดอื่นไม่ต่ำกว่ายอดใบ · แนบไฟล์ใหม่ทับไม่ได้', () => {
    const base = {
      receiptNumber: 'CRT-2569-0003',
      receiptTotalSatang: 32_000,
      expenseType: 'hotel' as const,
      amountSatang: 32_000,
      replacesReceiptFile: false,
    }
    expect(substituteReceiptResubmitProblem(base)).toBeNull()
    const mismatch = substituteReceiptResubmitProblem({ ...base, amountSatang: 35_000 })
    expect(mismatch).toContain('เท่ากับยอดเบิกค่าที่พัก')
    expect(mismatch).toContain('CRT-2569-0003')
    expect(mismatch).toContain('฿320.00')
    expect(mismatch).not.toMatch(/§|ไฟล์ \d/)
    expect(substituteReceiptResubmitProblem({ ...base, amountSatang: 30_000 })).not.toBeNull()
    const other = { ...base, expenseType: 'receipt' as const }
    expect(substituteReceiptResubmitProblem({ ...other, amountSatang: 35_000 })).toBeNull()
    expect(substituteReceiptResubmitProblem({ ...other, amountSatang: 31_999 })).toContain('ไม่เกินยอดเบิก')
    expect(substituteReceiptResubmitProblem({ ...base, replacesReceiptFile: true })).toContain('ยกเลิกใบรับรองก่อน')
  })
})

describe('มติ PO U117 ข้อ 1 — ฟอร์ม "ออกใบใหม่แทน" ดึงรายการ/ยอดจากใบที่ยกเลิก', () => {
  it('บรรทัดเดิม → ช่องกรอก (บาท 2 ตำแหน่ง) · ส่งต่อได้ยอดเท่าเดิม', () => {
    const drafts = substituteLinesToDrafts([
      { lineDate: '2026-10-03', description: 'ค่าที่พัก', amountSatang: 45_050, note: 'โรงแรมชลบุรี' },
      { lineDate: '2026-10-04', description: 'ค่าที่พักคืนที่ 2', amountSatang: 4_950, note: null },
    ])
    expect(drafts).toEqual([
      { key: 'line-0', lineDate: '2026-10-03', description: 'ค่าที่พัก', amountBaht: '450.50', note: 'โรงแรมชลบุรี' },
      { key: 'line-1', lineDate: '2026-10-04', description: 'ค่าที่พักคืนที่ 2', amountBaht: '49.50', note: '' },
    ])
    const payload = substituteDraftPayload(drafts)
    expect(payload.payload?.lines.map((entry) => entry.amountSatang)).toEqual([45_050, 4_950])
  })

  it('ไม่มีบรรทัด (โหลดไม่ได้) = บรรทัดว่าง 1 แถว', () => {
    expect(substituteLinesToDrafts([], '2026-10-06')).toEqual([
      { key: 'line-0', lineDate: '2026-10-06', description: '', amountBaht: '', note: '' },
    ])
  })
})

describe('ใบรับรองแทนใบเสร็จที่ยังมีผลของรายการ (mytester5 รีวิว D-OUT5-01)', () => {
  it('hasActiveSubstituteReceipt — ไม่นับใบที่ยกเลิก/ลบ', () => {
    expect(hasActiveSubstituteReceipt([])).toBe(false)
    expect(hasActiveSubstituteReceipt([{ status: 'cancelled', deletedAt: null }])).toBe(false)
    expect(hasActiveSubstituteReceipt([{ status: 'pending_signature', deletedAt: new Date() }])).toBe(false)
    expect(
      hasActiveSubstituteReceipt([
        { status: 'cancelled', deletedAt: null },
        { status: 'signed', deletedAt: null },
      ]),
    ).toBe(true)
    expect(hasActiveSubstituteReceipt([{ status: 'pending_signature' }])).toBe(true)
  })

  it('isSubstituteReceiptRefActive — ใบบนการ์ดที่ยกเลิกแล้ว = ไม่มีผล', () => {
    expect(isSubstituteReceiptRefActive(null)).toBe(false)
    expect(isSubstituteReceiptRefActive({ status: 'cancelled' })).toBe(false)
    expect(isSubstituteReceiptRefActive({ status: 'pending_signature' })).toBe(true)
  })
})

describe('ตรวจซ้ำ staging SV5-R2-01 — หลักฐานตอนส่งใหม่ (มติ PO 14/10/2569 แนวทาง ก)', () => {
  const ACTIVE = { receiptNumber: 'CRT-2569-0007', totalSatang: 34_550 }
  const base: ResubmitEvidenceInput = {
    expenseType: 'hotel',
    amountSatang: 34_550,
    active: ACTIVE,
    hasSubstituteHistory: true,
    hasReceiptFile: false,
    receiptFileIsActiveSigned: false,
    replacesReceiptFile: false,
    newSubstituteTotalSatang: null,
    cancelReason: null,
  }

  it('ใช้ใบเดิม: ยอดเท่ายอดใบผ่าน · ยอดไม่เท่าชี้ทางออกใบใหม่ในฟอร์ม · ส่งเหตุผลยกเลิกโดยไม่มีหลักฐานใหม่ไม่ได้', () => {
    expect(resubmitEvidenceDecision(base)).toEqual({ ok: true, cancelActive: false, cancelReason: null, issueNew: false })
    const mismatch = resubmitEvidenceDecision({ ...base, amountSatang: 29_825 })
    expect(mismatch).toMatchObject({ ok: false, code: 'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED' })
    expect(mismatch.ok ? '' : mismatch.message).toContain('ออกใบรับรองแทนใบเสร็จใหม่ตามยอดที่กรอก')
    expect(resubmitEvidenceDecision({ ...base, cancelReason: 'ยกเลิกเฉย ๆ' })).toMatchObject({
      ok: false,
      code: 'SUBSTITUTE_RECEIPT_NOT_CANCELLABLE',
    })
  })

  it('มีใบที่ใช้งานอยู่ + ออกใบใหม่/แนบใบเสร็จจริง ⇒ ต้องมีเหตุผลยกเลิก ≥ 5 ตัวอักษร แล้วยกเลิกพร้อมการส่ง', () => {
    const issue = { ...base, amountSatang: 29_825, newSubstituteTotalSatang: 29_825 }
    expect(resubmitEvidenceDecision(issue)).toMatchObject({ ok: false, code: 'CANCEL_REQUIRES_REASON' })
    expect(resubmitEvidenceDecision({ ...issue, cancelReason: ' สั้น ' })).toMatchObject({ ok: false, code: 'CANCEL_REQUIRES_REASON' })
    expect(resubmitEvidenceDecision({ ...issue, cancelReason: '  แก้ยอดตามจริง  ' })).toEqual({
      ok: true,
      cancelActive: true,
      cancelReason: 'แก้ยอดตามจริง',
      issueNew: true,
    })
    expect(
      resubmitEvidenceDecision({ ...base, replacesReceiptFile: true, cancelReason: 'ได้ใบเสร็จจริงแล้ว' }),
    ).toEqual({ ok: true, cancelActive: true, cancelReason: 'ได้ใบเสร็จจริงแล้ว', issueNew: false })
  })

  it('ใบใหม่: ค่าที่พักยอดต้องเท่ายอดเบิก · ชนิดอื่นไม่เกิน · เลือกทั้งใบใหม่และใบเสร็จไม่ได้ · ไม่เคยใช้ใบรับรอง = ไม่ได้', () => {
    const noActive = { ...base, active: null }
    expect(resubmitEvidenceDecision({ ...noActive, amountSatang: 29_825, newSubstituteTotalSatang: 29_825 })).toMatchObject({
      ok: true,
      issueNew: true,
      cancelActive: false,
    })
    const wrong = resubmitEvidenceDecision({ ...noActive, amountSatang: 29_825, newSubstituteTotalSatang: 34_550 })
    expect(wrong).toMatchObject({ ok: false, code: 'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED' })
    expect(wrong.ok ? '' : wrong.message).toContain('฿298.25')
    expect(wrong.ok ? '' : wrong.message).not.toMatch(/§|ไฟล์ \d/)
    const other = { ...noActive, expenseType: 'receipt' as const, amountSatang: 30_000 }
    expect(resubmitEvidenceDecision({ ...other, newSubstituteTotalSatang: 20_000 })).toMatchObject({ ok: true })
    expect(resubmitEvidenceDecision({ ...other, newSubstituteTotalSatang: 30_001 })).toMatchObject({ ok: false })
    expect(
      resubmitEvidenceDecision({ ...noActive, newSubstituteTotalSatang: 34_550, replacesReceiptFile: true }),
    ).toMatchObject({ ok: false, code: 'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED' })
    expect(
      resubmitEvidenceDecision({ ...noActive, hasSubstituteHistory: false, hasReceiptFile: true, newSubstituteTotalSatang: 34_550 }),
    ).toMatchObject({ ok: false, code: 'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED' })
  })

  it('มีใบเสร็จจริงแนบอยู่แล้ว ⇒ ออกใบรับรองซ้อนไม่ได้ · ไฟล์ที่เป็นฉบับเซ็นของใบที่ใช้งานอยู่ = ออกใหม่ได้ (ยกเลิกพร้อมการส่ง)', () => {
    expect(
      resubmitEvidenceDecision({ ...base, active: null, hasReceiptFile: true, newSubstituteTotalSatang: 34_550 }),
    ).toMatchObject({ ok: false, code: 'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED' })
    expect(
      resubmitEvidenceDecision({
        ...base,
        hasReceiptFile: true,
        receiptFileIsActiveSigned: true,
        newSubstituteTotalSatang: 34_550,
        cancelReason: 'ออกใบใหม่ตามยอด',
      }),
    ).toMatchObject({ ok: true, cancelActive: true, issueNew: true })
  })

  it('ค่าที่พักที่ไม่เหลือหลักฐาน ⇒ HOTEL_CLAIM_FIELD_REQUIRED · ใบเสร็จจริงเดิม/ใบรับรองเดิม = ผ่าน · ชนิดอื่นไม่บังคับ', () => {
    const cancelledOnly = { ...base, active: null }
    expect(resubmitEvidenceDecision(cancelledOnly)).toMatchObject({ ok: false, code: 'HOTEL_CLAIM_FIELD_REQUIRED' })
    expect(resubmitEvidenceDecision({ ...cancelledOnly, hasReceiptFile: true })).toMatchObject({ ok: true })
    expect(resubmitEvidenceDecision({ ...cancelledOnly, replacesReceiptFile: true })).toMatchObject({ ok: true })
    // ชนิดอื่น: เคยใช้ใบรับรองแล้วไม่เหลือหลักฐาน ⇒ ไม่ได้ (กติกาเดียวกับฟอร์ม) · ไม่เคยใช้ใบรับรอง ⇒ ไม่บังคับ
    expect(resubmitEvidenceDecision({ ...cancelledOnly, expenseType: 'receipt' })).toMatchObject({
      ok: false,
      code: 'HOTEL_CLAIM_FIELD_REQUIRED',
    })
    expect(
      resubmitEvidenceDecision({ ...cancelledOnly, expenseType: 'receipt', hasSubstituteHistory: false }),
    ).toMatchObject({ ok: true })
    // ไฟล์ปัจจุบันคือฉบับเซ็นของใบที่ยกเลิกพร้อมการส่ง — ไม่นับเป็นหลักฐาน แต่แนบใบเสร็จใหม่แล้วจึงผ่าน
    expect(
      resubmitEvidenceDecision({
        ...base,
        hasReceiptFile: true,
        receiptFileIsActiveSigned: true,
        replacesReceiptFile: true,
        cancelReason: 'ได้ใบเสร็จจริงแล้ว',
      }),
    ).toMatchObject({ ok: true, cancelActive: true })
  })

  it('ฟอร์มออกใบใหม่ตั้งต้นยอดรวม = ยอดเบิกปัจจุบัน (ไม่ใช่ยอดใบที่ยกเลิก)', () => {
    const one = [{ lineDate: '2026-10-08', description: 'ค่าห้องพัก', amountSatang: 34_550, note: null }]
    expect(fitSubstituteLinesToTotal(one, 29_825).map((entry) => entry.amountSatang)).toEqual([29_825])
    const two = [
      { lineDate: '2026-10-08', description: 'ค่าห้องพัก คืนที่ 1', amountSatang: 20_000, note: null },
      { lineDate: '2026-10-09', description: 'ค่าห้องพัก คืนที่ 2', amountSatang: 14_550, note: null },
    ]
    expect(fitSubstituteLinesToTotal(two, 29_825).map((entry) => entry.amountSatang)).toEqual([20_000, 9_825])
    // ปรับบรรทัดสุดท้ายแล้วติดลบ ⇒ คงเดิมให้ผู้ใช้แก้เอง
    expect(fitSubstituteLinesToTotal(two, 10_000).map((entry) => entry.amountSatang)).toEqual([20_000, 14_550])
    expect(fitSubstituteLinesToTotal([], 29_825, '2026-10-08')).toEqual([
      { lineDate: '2026-10-08', description: '', amountSatang: 29_825, note: null },
    ])
    expect(substituteLinesToDrafts(one, '', 29_825)[0]?.amountBaht).toBe('298.25')
    expect(substituteLinesToDrafts(one)[0]?.amountBaht).toBe('345.50')
  })

  it('schema ส่งใหม่: รับรายการใบใหม่ + เหตุผลยกเลิก · ใบใหม่คู่กับไฟล์ใบเสร็จไม่ได้', () => {
    const lines = [{ lineDate: '2026-10-08', description: 'ค่าห้องพัก 1 คืน', amountSatang: 29_825, note: null }]
    expect(
      resubmitExpenseSchema.safeParse({ substituteReceipt: { lines }, cancelSubstituteReason: 'แก้ยอด', note: 'x' }).success,
    ).toBe(true)
    expect(
      resubmitExpenseSchema.safeParse({
        substituteReceipt: { lines },
        receiptFileUrl: 'expense-receipts/u/66666666-6666-4666-8666-666666666666.jpg',
      }).success,
    ).toBe(false)
  })
})

/** ตรวจซ้ำ staging SV5-R4-01 — ข้อผิดของรายการชี้แถวและช่องที่ผิดจริง (ไม่ใช่ช่องแรกของแถวแรกเสมอ) */
describe('substituteDraftPayload — ตำแหน่งที่ผิด (แถว + ช่อง)', () => {
  const valid = (key: string) => ({
    ...emptySubstituteLine(key, '2026-10-03'),
    description: 'ค่าห้องพัก 1 คืน',
    amountBaht: '500',
  })

  it('กรอกครบ ⇒ ไม่มีตำแหน่งผิด', () => {
    expect(substituteDraftPayload([valid('a'), valid('b')])).toMatchObject({ error: null, at: null })
  })

  it('แถวที่ 2 ผิดช่องจำนวนเงิน ⇒ ชี้แถว 2 ช่อง amount', () => {
    const result = substituteDraftPayload([valid('a'), { ...valid('b'), amountBaht: '0' }])
    expect(result.at).toEqual({ lineIndex: 1, lineKey: 'b', field: 'amount' })
    expect(result.error).toMatch(/^รายการที่ 2: /)
  })

  it('แถวที่ 1 ไม่มีรายละเอียด ⇒ ชี้ช่อง description ไม่ใช่วันที่', () => {
    const result = substituteDraftPayload([{ ...valid('a'), description: '' }])
    expect(result.at).toEqual({ lineIndex: 0, lineKey: 'a', field: 'description' })
    expect(result.error).toBe('รายการที่ 1: ระบุรายละเอียดรายจ่ายอย่างน้อย 3 ตัวอักษร')
  })

  it('หลายช่องผิด ⇒ เลือกแถวบนก่อน แล้วช่องซ้ายก่อนในแถวเดียวกัน', () => {
    const result = substituteDraftPayload([
      valid('a'),
      { ...valid('b'), description: '', amountBaht: '' },
      { ...valid('c'), lineDate: '' },
    ])
    expect(result.at).toEqual({ lineIndex: 1, lineKey: 'b', field: 'description' })
    expect(substituteDraftPayload([{ ...valid('a'), lineDate: '', amountBaht: 'x' }]).at).toEqual({
      lineIndex: 0,
      lineKey: 'a',
      field: 'lineDate',
    })
  })

  it('ไม่มีบรรทัด ⇒ ผิดระดับตาราง (at = null)', () => {
    const result = substituteDraftPayload([])
    expect(result.at).toBeNull()
    expect(result.error).toBe('ต้องมีรายจ่ายอย่างน้อย 1 รายการ')
  })

  it('id ของช่องในแถว — ไม่ชนกันข้ามแถว/ช่อง', () => {
    expect(substituteLineInputId('p', 1, 'amount')).toBe('p-line-1-amount')
    expect(substituteLineInputId('p', 0, 'amount')).not.toBe(substituteLineInputId('p', 0, 'description'))
  })
})

/** ตรวจซ้ำ staging SV5-R4-01 (ต่อ) — ข้อผิดที่ส่งเข้า editor ของทุกฟอร์ม (เบิกเอง/เคลียร์เงินทดรอง/ออกใบใหม่แทน) */
describe('substituteLineRowError', () => {
  const drafts = [emptySubstituteLine('a'), emptySubstituteLine('b')]
  const at = { lineIndex: 1, lineKey: 'b', field: 'amount' as const }

  it('มีข้อความ + แถวยังอยู่ ⇒ ข้อผิดของแถวนั้น', () => {
    expect(substituteLineRowError('รายการที่ 2: จำนวนเงินต้องมากกว่า 0', at, drafts)).toEqual({
      ...at,
      message: 'รายการที่ 2: จำนวนเงินต้องมากกว่า 0',
    })
  })

  it('ไม่มีข้อความ / ผิดระดับตาราง / แถวถูกลบแล้ว ⇒ null (แสดงใต้ทั้งตารางแทน)', () => {
    expect(substituteLineRowError(null, at, drafts)).toBeNull()
    expect(substituteLineRowError(undefined, at, drafts)).toBeNull()
    expect(substituteLineRowError('ต้องมีรายจ่ายอย่างน้อย 1 รายการ', null, drafts)).toBeNull()
    expect(substituteLineRowError('รายการที่ 2: …', at, [emptySubstituteLine('a')])).toBeNull()
  })

  it('ใช้คู่ substituteDraftPayload — แถว 2 ผิดช่องจำนวนเงินของฟอร์มใดก็ชี้แถว 2 ช่อง amount', () => {
    const lines = [
      { ...emptySubstituteLine('x', '2026-10-03'), description: 'ค่าทางด่วน', amountBaht: '50' },
      { ...emptySubstituteLine('y', '2026-10-03'), description: 'ค่าที่จอดรถ', amountBaht: '' },
    ]
    const draft = substituteDraftPayload(lines)
    expect(substituteLineRowError(draft.error, draft.at, lines)).toMatchObject({ lineIndex: 1, lineKey: 'y', field: 'amount' })
  })
})

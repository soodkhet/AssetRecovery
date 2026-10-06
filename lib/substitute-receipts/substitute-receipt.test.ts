import { describe, expect, it } from 'vitest'
import { substituteDraftPayload, substituteLinesToDrafts } from '@/lib/substitute-receipts/form'
import { SubstituteReceiptError } from '@/lib/substitute-receipts/errors'
import { substituteReceiptDraftSchema, substituteReceiptLineSchema } from '@/lib/substitute-receipts/schemas'
import {
  assertWithinSubstituteReceiptLimits,
  canCancelSubstituteReceipt,
  canUploadSignedSubstituteReceipt,
  canViewSubstituteReceipt,
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG,
  DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG,
  isSubstituteReceiptActive,
  requireSubstituteReceiptCancelReason,
  substituteReceiptBadgeText,
  substituteReceiptCancelProblem,
  substituteReceiptCancelProblemMessage,
  substituteReceiptReissueTotalProblem,
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

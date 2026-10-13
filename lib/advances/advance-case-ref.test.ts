import { describe, expect, it } from 'vitest'
import { advanceExcessClaimNote, advanceExcessItemLabel, advanceExcessSource } from '@/lib/advances/advance'
import { buildAdvanceRequestDoc, type AdvanceDocSource } from '@/lib/advances/advance-doc'
import { advanceCaseOptionLabel } from '@/lib/advances/advance-ui'
import { advanceCreateSchema } from '@/lib/advances/schemas'
import { claimRefLabel, claimTypeLabel } from '@/lib/compensation/approval-ui'
import { testLetterhead } from '@/tests/helpers/letterhead'

/**
 * mytester DO-07 (มติ 13/10/2569) — อ้างอิงเคสของเงินทดรอง: schema ร่วม FE/BE · หมายเหตุคำขอเบิกส่วนเกิน ·
 * ป้ายบนคิวอนุมัติ/รอบจ่าย/สลิป · ตัวเลือกฟอร์ม · ใบเบิกเงินทดรอง (scope ของเคสตรวจใน `advance-case-ref.db.test.ts`)
 */

const CASE_ID = '3f2b8c1e-6a4d-4f9e-9b1a-2c3d4e5f6a7b'

function parseCreate(caseId: unknown) {
  return advanceCreateSchema.safeParse({
    requestedSatang: 100_000,
    purpose: 'ค่าเดินทางไปติดตามทรัพย์',
    dueClearDate: '2099-01-01',
    payeeId: null,
    caseId,
  })
}

describe('advanceCreateSchema — caseId (ไม่บังคับ)', () => {
  it('เว้นว่าง/ไม่ส่ง/ช่องว่าง = null', () => {
    for (const value of [undefined, null, '', '  ']) {
      const parsed = parseCreate(value)
      expect(parsed.success).toBe(true)
      expect(parsed.success && parsed.data.caseId).toBeNull()
    }
  })

  it('UUID ผ่าน · ข้อความอื่นไม่ผ่าน (field error ที่ caseId)', () => {
    const ok = parseCreate(CASE_ID)
    expect(ok.success && ok.data.caseId).toBe(CASE_ID)
    const bad = parseCreate('NDP-03')
    expect(bad.success).toBe(false)
    expect(bad.success ? [] : bad.error.issues.map((issue) => issue.path.join('.'))).toContain('caseId')
  })
})

describe('หมายเหตุคำขอเบิกส่วนเกินเงินทดรอง — เลขเคส', () => {
  const base = { purpose: 'ค่าเดินทาง', approvedSatang: 400_000, usedSatang: 450_000, advanceNumber: 'ADV-2569-0003' }

  it('เงินทดรองอ้างอิงเคส ⇒ หมายเหตุมี "· เคส <เลขสัญญา>" และอ่านกลับได้', () => {
    const note = advanceExcessClaimNote({ ...base, caseRef: 'NDP/2569 (03)' })
    expect(note).toContain('ADV-2569-0003 · เคส NDP/2569 (03) (ใช้จริง')
    expect(advanceExcessSource(note)).toEqual({ advanceNumber: 'ADV-2569-0003', caseRef: 'NDP/2569 (03)' })
  })

  it('ไม่อ้างอิงเคส / หมายเหตุรุ่นเก่า ⇒ caseRef = null (เลข ADV ยังอ่านได้)', () => {
    expect(advanceExcessSource(advanceExcessClaimNote(base))).toEqual({ advanceNumber: 'ADV-2569-0003', caseRef: null })
    expect(advanceExcessSource(advanceExcessClaimNote({ ...base, caseRef: '  ' }))?.caseRef).toBeNull()
    expect(advanceExcessSource('เบิกส่วนเกินเงินทดรองอัตโนมัติ ADV-2569-0001 อื่นๆ')).toEqual({
      advanceNumber: 'ADV-2569-0001',
      caseRef: null,
    })
    expect(advanceExcessSource('ค่าทางด่วน')).toBeNull()
  })

  it('ป้ายรายการ = "ส่วนเกินเงินทดรอง ADV-…" · รายการทั่วไป = null', () => {
    expect(advanceExcessItemLabel(advanceExcessClaimNote({ ...base, caseRef: 'NDP-03' }))).toBe('ส่วนเกินเงินทดรอง ADV-2569-0003')
    expect(advanceExcessItemLabel(null)).toBeNull()
    expect(advanceExcessItemLabel('ค่าทางด่วน')).toBeNull()
  })
})

describe('คิวอนุมัติ (ผู้จัดการ/การเงิน) — อ้างอิง + ประเภท', () => {
  const excessNote = advanceExcessClaimNote({
    purpose: 'ค่าเดินทาง',
    approvedSatang: 1,
    usedSatang: 2,
    advanceNumber: 'ADV-2569-0001',
    caseRef: 'MTJ-11',
  })

  it('คำขอเบิกส่วนเกินที่เงินทดรองอ้างอิงเคส ⇒ เลขเคส + "ส่วนเกินเงินทดรอง" แทน "รายการกรอกเอง"', () => {
    expect(claimRefLabel({ caseRef: null, note: excessNote })).toBe('MTJ-11')
    expect(claimTypeLabel({ expenseType: 'manual', note: excessNote })).toBe('ส่วนเกินเงินทดรอง ADV-2569-0001')
  })

  it('รายการทั่วไปคงเดิม', () => {
    expect(claimRefLabel({ caseRef: 'NDP-03', note: null })).toBe('NDP-03')
    expect(claimRefLabel({ caseRef: null, note: 'ค่าทางด่วน' })).toBe('— ไม่ผูกเคส')
    expect(claimTypeLabel({ expenseType: 'manual', note: 'ค่าทางด่วน' })).toBe('รายการกรอกเอง')
    expect(claimTypeLabel({ expenseType: 'hotel', note: null })).toBe('ค่าที่พัก')
  })
})

describe('ตัวเลือกช่อง "อ้างอิงเคส" ของฟอร์ม', () => {
  it('เลขสัญญา · ชื่อลูกหนี้ · ไม่มีชื่อ = เลขสัญญาอย่างเดียว', () => {
    expect(advanceCaseOptionLabel({ caseRef: 'NDP-03', debtorName: 'สมหญิง ใจดี' })).toBe('NDP-03 · สมหญิง ใจดี')
    expect(advanceCaseOptionLabel({ caseRef: 'NDP-03', debtorName: null })).toBe('NDP-03')
    expect(advanceCaseOptionLabel({ caseRef: 'NDP-03', debtorName: ' ' })).toBe('NDP-03')
  })
})

describe('ใบเบิกเงินทดรอง — แถว "อ้างอิงเคส"', () => {
  const source: AdvanceDocSource = {
    advanceNumber: 'ADV-2569-0012',
    status: 'approved',
    requestedSatang: 300_000,
    approvedSatang: 300_000,
    usedSatang: 0,
    returnSatang: 300_000,
    purpose: 'ค่าเดินทาง',
    dueClearDate: new Date('2026-10-20T00:00:00Z'),
    createdAt: new Date('2026-10-13T03:00:00Z'),
    approvedAt: new Date('2026-10-13T04:00:00Z'),
    clearedAt: null,
    approverName: 'การเงิน',
    teamName: 'ทีม A',
    payee: {
      fullName: 'สมชาย ภาคสนาม',
      nameTitle: 'นาย',
      phone: null,
      nationalId: null,
      addressDetail: null,
      addressSubdistrict: null,
      addressDistrict: null,
      addressProvince: null,
      addressPostalCode: null,
      bankName: null,
      accountNumber: null,
    },
    payoutBatchName: null,
    substituteReceiptNumber: null,
  }

  it('อ้างอิงเคส ⇒ มีแถว · ไม่อ้างอิง ⇒ ไม่มีแถว', () => {
    const withCase = buildAdvanceRequestDoc({ ...source, caseRef: 'NDP-03' }, testLetterhead())
    expect(withCase.meta).toContainEqual({ label: 'อ้างอิงเคส', value: 'NDP-03' })
    const without = buildAdvanceRequestDoc(source, testLetterhead())
    expect(without.meta.map((row) => row.label)).not.toContain('อ้างอิงเคส')
  })
})

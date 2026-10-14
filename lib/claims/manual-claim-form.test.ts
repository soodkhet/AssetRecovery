import { describe, expect, it } from 'vitest'
import { toFieldErrors } from '@/lib/api/validation'
import { manualClaimFormIssues } from '@/lib/claims/manual-claim-form'
import { claimCreateSchema } from '@/lib/claims/schemas'
import {
  emptySubstituteLine,
  followSubstituteLineDates,
  substituteDraftPayload,
  substituteDraftTotalSatang,
  type SubstituteLineDraft,
} from '@/lib/substitute-receipts/form'

/** จำลอง submit() ของฟอร์มสร้างรายการเบิกเอง — schema + ตารางรายการชุดเดียวกับ modal */
function check(input: { expenseDate: string; noReceipt: boolean; lines?: SubstituteLineDraft[]; amount?: number; note?: string }) {
  const lines = input.lines ?? [emptySubstituteLine('line-0')]
  const substitute = input.noReceipt ? substituteDraftPayload(lines) : null
  const parsed = claimCreateSchema.safeParse({
    claimType: 'manual',
    grossSatang: input.noReceipt ? substituteDraftTotalSatang(lines) : (input.amount ?? 10_000),
    expenseDate: input.expenseDate,
    payeeId: null,
    receiptFileUrl: input.noReceipt ? null : 'pending-upload',
    substituteReceipt: substitute === null ? null : substitute.payload,
    note: input.note ?? '',
  })
  return manualClaimFormIssues({
    schemaErrors: parsed.success ? {} : toFieldErrors(parsed.error),
    noReceipt: input.noReceipt,
    linesError: substitute === null || substitute.error === null ? null : { message: substitute.error, at: substitute.at },
  })
}

describe('ตรวจซ้ำ staging SV5-R5-01 — ฟอร์มสร้างรายการเบิกเอง ชี้ช่องที่ผิดตามลำดับบนจอ', () => {
  it('ไม่มีใบเสร็จ + วันที่เกิดรายการว่าง + ตารางว่าง ⇒ ชี้วันที่เกิดรายการก่อน แต่ยังแสดงข้อผิดของตาราง', () => {
    const result = check({ expenseDate: '', noReceipt: true })
    expect(result.first).toMatchObject({ field: 'expenseDate' })
    expect(result.errors.substituteReceipt).toMatch(/^รายการที่ 1:/)
  })

  it('ไม่มีใบเสร็จ + ตารางผิด ⇒ ไม่ชี้ยอดเงิน (คำนวณจากตาราง) และไม่ขึ้น "ต้องแนบใบเสร็จ"', () => {
    const result = check({ expenseDate: '2026-10-01', noReceipt: true })
    expect(result.errors.grossSatang).toBeUndefined()
    expect(result.errors.receiptFileUrl).toBeUndefined()
    expect(result.first).toMatchObject({ field: 'substituteReceipt', message: expect.stringMatching(/^รายการที่ 1:/) })
  })

  it('ไม่มีใบเสร็จ + ตารางครบ ⇒ ผ่าน', () => {
    const lines = [{ ...emptySubstituteLine('a', '2026-10-01'), description: 'ค่าทางด่วน', amountBaht: '70' }]
    expect(check({ expenseDate: '2026-10-01', noReceipt: true, lines }).first).toBeNull()
  })

  it('มีใบเสร็จ ⇒ ยอดเงินมาก่อนวันที่เกิดรายการ (ลำดับบนจอ ไม่ใช่ลำดับของ schema)', () => {
    const result = manualClaimFormIssues({
      schemaErrors: { expenseDate: 'กรุณาเลือกวันที่เกิดรายการ', grossSatang: 'ยอดเงินต้องมากกว่า 0', note: 'หมายเหตุยาวเกินไป' },
      noReceipt: false,
      linesError: null,
    })
    expect(result.first).toEqual({ field: 'grossSatang', message: 'ยอดเงินต้องมากกว่า 0' })
    expect(Object.keys(result.errors)).toHaveLength(3)
  })

  it('ข้อผิดย่อยของรายการจาก schema รวมเป็นช่องตาราง · ช่องที่ไม่รู้จักไปท้ายสุด', () => {
    const result = manualClaimFormIssues({
      schemaErrors: { _: 'ข้อมูลไม่ถูกต้อง', 'substituteReceipt.lines.0.description': 'กรอกรายละเอียด' },
      noReceipt: true,
      linesError: null,
    })
    expect(result.errors).toEqual({ _: 'ข้อมูลไม่ถูกต้อง', substituteReceipt: 'กรอกรายละเอียด' })
    expect(result.first?.field).toBe('substituteReceipt')
  })

  it('ไม่มีข้อผิด ⇒ first = null', () => {
    expect(manualClaimFormIssues({ schemaErrors: {}, noReceipt: false, linesError: null })).toEqual({ errors: {}, first: null })
  })
})

describe('ตรวจซ้ำ staging SV5-R5-01 — วันที่จ่ายของแถวตามวันที่หลัก', () => {
  const lines: SubstituteLineDraft[] = [
    emptySubstituteLine('blank'),
    emptySubstituteLine('same', '2026-10-01'),
    emptySubstituteLine('edited', '2026-09-28'),
  ]

  it('แถวว่าง/เท่าวันที่เดิมตามไป · แถวที่แก้เองไม่ถูกทับ', () => {
    expect(followSubstituteLineDates(lines, '2026-10-01', '2026-10-05').map((line) => line.lineDate)).toEqual([
      '2026-10-05',
      '2026-10-05',
      '2026-09-28',
    ])
  })

  it('กรอกวันที่หลักครั้งแรก (เดิมว่าง) ⇒ แถวที่สร้างตอนวันที่ยังว่างได้วันที่', () => {
    expect(followSubstituteLineDates([emptySubstituteLine('x')], '', '2026-10-03')[0]?.lineDate).toBe('2026-10-03')
  })

  it('วันที่ไม่เปลี่ยน ⇒ คงเดิม (ไม่แก้ array เดิม)', () => {
    const result = followSubstituteLineDates(lines, '2026-10-01', '2026-10-01')
    expect(result).toEqual(lines)
    expect(result).not.toBe(lines)
  })
})

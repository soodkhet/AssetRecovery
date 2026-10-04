import { describe, expect, it } from 'vitest'
import {
  buildWhtCertificateDoc,
  filingFormOf,
  groupCertificateSources,
  incomeTypeOf,
  summarizeFilingTotals,
  type CertificateSourceItem,
  type WhtCertificateDocSource,
} from '@/lib/wht/wht'
import { INCOME_TYPE_TEXT_40_2 } from '@/lib/settings/wht-policy'

/** ใบ 50 ทวิ ตามค่าตั้งภาษี — มติ PO 05/10/2569 (UAT U4/U7) */

const items: CertificateSourceItem[] = [
  // in1: คอมมิชชัน/น้ำมัน/เบี้ยเลี้ยง อยู่ในฐาน · ค่าที่พักไม่อยู่ในฐาน (ภาษีรวม 4,050)
  { id: 'r1', payeeId: 'in1', grossSatang: 100_000, whtSatang: 3000, whtBaseIncluded: true },
  { id: 'r2', payeeId: 'in1', grossSatang: 20_000, whtSatang: 600, whtBaseIncluded: true },
  { id: 'r3', payeeId: 'in1', grossSatang: 15_000, whtSatang: 450, whtBaseIncluded: true },
  { id: 'r4', payeeId: 'in1', grossSatang: 60_000, whtSatang: 0, whtBaseIncluded: false },
  // out1: สองรายการ
  { id: 'r5', payeeId: 'out1', grossSatang: 550_000, whtSatang: 16_500, whtBaseIncluded: true },
  { id: 'r6', payeeId: 'out1', grossSatang: 400_000, whtSatang: 12_000, whtBaseIncluded: true },
  // in2: ต่ำกว่าเกณฑ์ — ไม่มีภาษี ไม่ออกใบทั้งสองแบบ
  { id: 'r7', payeeId: 'in2', grossSatang: 50_000, whtSatang: 0, whtBaseIncluded: true },
]

describe('(จ) 50 ทวิ ต่อผู้รับต่อรอบ vs ต่อรายการ', () => {
  const perBatch = groupCertificateSources(items, 'per_payee_batch')
  const perItem = groupCertificateSources(items, 'per_item')

  it('ยอดภาษีรวมเท่ากันทั้งสองแบบ', () => {
    const sum = (groups: { whtSatang: number }[]) => groups.reduce((total, group) => total + group.whtSatang, 0)
    expect(sum(perBatch)).toBe(32_550)
    expect(sum(perItem)).toBe(32_550)
  })

  it('ต่อผู้รับต่อรอบ = 1 ใบต่อผู้รับที่มีภาษี · ยอดจ่ายเฉพาะรายการในฐาน', () => {
    expect(perBatch).toHaveLength(2)
    const in1 = perBatch[0]!
    expect(in1.anchor.id).toBe('r1')
    expect(in1.members.map((member) => member.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(in1.grossSatang).toBe(135_000)
    expect(in1.whtSatang).toBe(4050)
    expect(perBatch[1]!.grossSatang).toBe(950_000)
    expect(perBatch[1]!.whtSatang).toBe(28_500)
  })

  it('ต่อรายการ = 1 ใบต่อรายการที่หักภาษี (พฤติกรรมเดิม)', () => {
    expect(perItem.map((group) => group.anchor.id)).toEqual(['r1', 'r2', 'r3', 'r5', 'r6'])
    expect(perItem.every((group) => group.members.length === 1)).toBe(true)
  })
})

describe('40(2) → ภ.ง.ด.1 (U7)', () => {
  it('ประเภทเงินได้ 40(2) ยื่น ภ.ง.ด.1 เสมอ ไม่ว่า Tax Profile จะระบุอะไร', () => {
    expect(filingFormOf({ taxProfileFilingForm: 'PND3', payeeType: 'individual', incomeCategory: 'sec_40_2' })).toBe('PND1')
    expect(filingFormOf({ taxProfileFilingForm: 'PND3', payeeType: 'individual', incomeCategory: 'sec_40_8' })).toBe('PND3')
    expect(filingFormOf({ taxProfileFilingForm: null, payeeType: 'corporate', incomeCategory: null })).toBe('PND53')
  })

  it('ข้อความประเภทเงินได้บนใบ = 40(2)', () => {
    expect(incomeTypeOf('ค่าจ้างทำของ มาตรา 40(8)', 'sec_40_2')).toBe(INCOME_TYPE_TEXT_40_2)
    expect(incomeTypeOf('ค่าจ้างทำของ มาตรา 40(8)', 'sec_40_8')).toBe('ค่าจ้างทำของ มาตรา 40(8)')
  })

  it('สรุปรอบนำส่งแยก ภ.ง.ด.1 ออกจาก ภ.ง.ด.3/53 · ใบยกเลิกไม่นับ', () => {
    const totals = summarizeFilingTotals([
      { status: 'active', filingForm: 'PND1', whtSatang: 1250, grossSatang: 50_000 },
      { status: 'active', filingForm: 'PND3', whtSatang: 4050, grossSatang: 135_000 },
      { status: 'cancelled', filingForm: 'PND1', whtSatang: 999, grossSatang: 10_000 },
    ])
    expect(totals.pnd1Satang).toBe(1250)
    expect(totals.pnd3Satang).toBe(4050)
    expect(totals.pnd53Satang).toBe(0)
    expect(totals.activeCount).toBe(2)
  })
})

describe('PDF 50 ทวิ แบบต่อรอบ', () => {
  const base: WhtCertificateDocSource = {
    certificateNumber: 'WHT-2569-010',
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    replacesCertificateNumber: null,
    deliveryFormat: 'paper',
    filingForm: 'PND1',
    incomeType: INCOME_TYPE_TEXT_40_2,
    paymentDate: new Date('2026-10-05T00:00:00Z'),
    grossSatang: 135_000,
    whtSatang: 4050,
    payer: { name: 'บริษัท', taxId: '0105555000000', address: '—', phone: null },
    payee: { name: 'in1', taxId: '1100000000001', address: '—', phone: null },
  }

  it('แสดงยอดรวมของรอบ + หมายเหตุว่ารวมกี่รายการ', () => {
    const doc = buildWhtCertificateDoc({ ...base, coverage: { payoutBatchName: 'จ่าย Inhouse 05/10/2569', itemCount: 4 } })
    expect(doc.grossText).toContain('1,350.00')
    expect(doc.whtText).toContain('40.50')
    expect(doc.coverageNote).toBe('ยอดรวมทุกรายการของผู้รับในรอบจ่าย "จ่าย Inhouse 05/10/2569" (4 รายการ)')
    expect(doc.filingFormLabel).toContain('ภ.ง.ด.1')
  })

  it('ใบต่อรายการไม่มีหมายเหตุ', () => {
    expect(buildWhtCertificateDoc(base).coverageNote).toBeNull()
  })
})

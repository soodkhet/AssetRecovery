import { describe, expect, it } from 'vitest'
import { formatThaiAddressLine } from '@/lib/address/address-value'
import { calculatePayeeBatchWht } from '@/lib/finance/wht-calc'
import { bahtInWords } from '@/lib/payout/baht-text'
import {
  INCOME_TYPE_TEXT_CORPORATE,
  resolveIncomeCategory,
  usesPerPayeeWhtRate,
  WHT_INCOME_CATEGORIES,
  WHT_INCOME_TYPE_MODES,
  type WhtIncomeTypeMode,
} from '@/lib/settings/wht-policy'
import {
  buildWhtCertificateDoc,
  filingFormOf,
  filingSequenceNumber,
  incomeTypeOf,
  officialFilingBoxOf,
  officialIncomeRowOf,
  whtPartyBranchLabel,
  type WhtCertificateDocSource,
} from '@/lib/wht/wht'

/**
 * มติ PO 06/10/2569 (UAT U96 #2 · #4 · #13 · U94 ข้อ 1) — ผู้รับนิติบุคคล + แบบฟอร์ม 50 ทวิ ทางการ
 */

const SIDES = ['inhouse', 'outsource', null] as const

describe('U96 #2 — ผู้รับนิติบุคคล: ไม่ใช่เงินได้ 40(1)/40(2) · ยื่น ภ.ง.ด.53 เสมอ', () => {
  const policyOf = (incomeTypeMode: WhtIncomeTypeMode) => ({
    incomeTypeMode,
    inhouseIncomeCategory: 'sec_40_1' as const,
    outsourceIncomeCategory: 'sec_40_2' as const,
  })

  it.each(WHT_INCOME_TYPE_MODES)('โหมด %s: นิติบุคคลได้หมวด Tax Profile (ไม่ใช้อัตราต่อคน) ทุกฝั่ง', (mode) => {
    for (const side of SIDES) {
      const category = resolveIncomeCategory(policyOf(mode), side, 'corporate')
      expect(category).toBe('sec_40_8')
      expect(usesPerPayeeWhtRate(category)).toBe(false)
    }
  })

  it('บุคคลธรรมดายังเป็นไปตามค่าตั้งเดิม (ไม่กระทบ)', () => {
    expect(resolveIncomeCategory(policyOf('all_40_2'), 'outsource', 'individual')).toBe('sec_40_2')
    expect(resolveIncomeCategory(policyOf('by_team_side'), 'inhouse', 'individual')).toBe('sec_40_1')
    expect(resolveIncomeCategory(policyOf('by_team_side'), 'inhouse')).toBe('sec_40_1')
  })

  it.each(WHT_INCOME_CATEGORIES)('แบบที่ยื่นของนิติบุคคล = ภ.ง.ด.53 แม้หมวดที่ snapshot เป็น %s', (category) => {
    for (const taxProfileFilingForm of ['PND3', 'PND53', 'PND1', null] as const) {
      expect(filingFormOf({ taxProfileFilingForm, payeeType: 'corporate', incomeCategory: category })).toBe('PND53')
    }
  })

  it('ข้อความประเภทเงินได้ของนิติบุคคลไม่อ้าง "มาตรา 40" — ข้อความเฉพาะของ Tax Profile ยังใช้ได้', () => {
    expect(incomeTypeOf('ค่าจ้างทำของ มาตรา 40(8)', 'sec_40_8', 'corporate')).toBe(INCOME_TYPE_TEXT_CORPORATE)
    expect(incomeTypeOf(null, 'sec_40_2', 'corporate')).toBe(INCOME_TYPE_TEXT_CORPORATE)
    expect(incomeTypeOf('ค่าขนส่ง', 'sec_40_8', 'corporate')).toBe('ค่าขนส่ง')
    expect(INCOME_TYPE_TEXT_CORPORATE).not.toMatch(/40\s*\(/)
  })

  it('ยอดภาษีนิติบุคคลใช้อัตรา Tax Profile + เกณฑ์ ฿1,000 (ไม่ใช่อัตราต่อคน 40(2))', () => {
    const category = resolveIncomeCategory(policyOf('all_40_2'), 'outsource', 'corporate')
    const result = calculatePayeeBatchWht(
      [
        {
          grossSatang: 120_000,
          includedInBase: true,
          source: {
            payeeTaxProfile: { whtPct: 3, whtBasis: 'before_vat', whtMinThresholdSatang: 100_000 },
            planWhtPct: 3,
          },
        },
      ],
      { incomeCategory: category, section402Pct: 10 },
    )
    expect(result.lines[0]?.whtSatang).toBe(3_600)
  })
})

describe('จำนวนเงินภาษีเป็นตัวอักษรไทย (U96 #13)', () => {
  it.each([
    [4_050, 'สี่สิบบาทห้าสิบสตางค์'],
    [135_000, 'หนึ่งพันสามร้อยห้าสิบบาทถ้วน'],
    [2_521, 'ยี่สิบห้าบาทยี่สิบเอ็ดสตางค์'],
    [0, 'ศูนย์บาทถ้วน'],
  ])('%i สตางค์ = "%s"', (satang, words) => {
    expect(bahtInWords(satang)).toBe(words)
  })
})

describe('ลำดับที่ในแบบ ภ.ง.ด. (U96 #13)', () => {
  const entries = [
    { payeeId: 'B', certificateNumber: 'WHT-2569-003', status: 'active' as const },
    { payeeId: 'A', certificateNumber: 'WHT-2569-001', status: 'active' as const },
    { payeeId: 'A', certificateNumber: 'WHT-2569-004', status: 'active' as const },
    { payeeId: 'C', certificateNumber: 'WHT-2569-002', status: 'cancelled' as const },
    { payeeId: 'D', certificateNumber: 'WHT-2569-010', status: 'active' as const },
    { payeeId: 'E', certificateNumber: 'WHT-2569-009', status: 'active' as const },
  ]

  it('ผู้รับ 1 รายได้ลำดับเดียว เรียงตามเลขที่ใบแรก · ใบยกเลิกไม่นับ', () => {
    expect(filingSequenceNumber(entries, 'A')).toBe(1)
    expect(filingSequenceNumber(entries, 'B')).toBe(2)
    expect(filingSequenceNumber(entries, 'E')).toBe(3)
    expect(filingSequenceNumber(entries, 'D')).toBe(4)
  })

  it('ใบที่ยกเลิกของผู้รับเป้าหมายยังพิมพ์ลำดับได้ (ณ ตำแหน่งเดิม) · ไม่พบผู้รับ = null', () => {
    expect(filingSequenceNumber(entries, 'C')).toBe(2)
    expect(filingSequenceNumber(entries, 'Z')).toBeNull()
  })

  it('เรียงเลขแบบตัวเลข — 1000 มาหลัง 999', () => {
    expect(
      filingSequenceNumber(
        [
          { payeeId: 'X', certificateNumber: 'WHT-2569-1000', status: 'active' },
          { payeeId: 'Y', certificateNumber: 'WHT-2569-999', status: 'active' },
        ],
        'X',
      ),
    ).toBe(2)
  })
})

describe('แบบฟอร์มทางการ 50 ทวิ (U96 #13)', () => {
  it('ช่องแบบ ภ.ง.ด.: ภ.ง.ด.1 → 1ก · ภ.ง.ด.3 → 3 · ภ.ง.ด.53 → 53', () => {
    expect(officialFilingBoxOf('PND1')).toBe('PND1A')
    expect(officialFilingBoxOf('PND3')).toBe('PND3')
    expect(officialFilingBoxOf('PND53')).toBe('PND53')
  })

  it('แถวประเภทเงินได้: 40(1)=1 · 40(2)=2 · 40(8)/รอบเก่า=5 · นิติบุคคล=5 เสมอ', () => {
    expect(officialIncomeRowOf({ incomeCategory: 'sec_40_1', payeeType: 'individual' })).toBe('1')
    expect(officialIncomeRowOf({ incomeCategory: 'sec_40_2', payeeType: 'individual' })).toBe('2')
    expect(officialIncomeRowOf({ incomeCategory: 'sec_40_8', payeeType: 'individual' })).toBe('5')
    expect(officialIncomeRowOf({ incomeCategory: null, payeeType: 'individual' })).toBe('5')
    expect(officialIncomeRowOf({ incomeCategory: 'sec_40_2', payeeType: 'corporate' })).toBe('5')
  })

  it('สาขาพิมพ์เฉพาะนิติบุคคล', () => {
    expect(whtPartyBranchLabel('00000')).toBe('สำนักงานใหญ่')
    expect(whtPartyBranchLabel('00003', 'corporate')).toBe('สาขาที่ 00003')
    expect(whtPartyBranchLabel('00000', 'individual')).toBeNull()
    expect(whtPartyBranchLabel(null, 'corporate')).toBeNull()
  })

  const source: WhtCertificateDocSource = {
    certificateNumber: 'WHT-2569-012',
    status: 'active',
    cancelReason: null,
    cancelledAt: null,
    replacesCertificateNumber: null,
    deliveryFormat: 'paper',
    filingForm: 'PND1',
    incomeType: 'ค่าธรรมเนียม ค่านายหน้า มาตรา 40(2)',
    paymentDate: new Date('2026-10-05T00:00:00Z'),
    grossSatang: 135_000,
    whtSatang: 4_050,
    issuedAt: new Date('2026-10-06T02:00:00Z'),
    payeeType: 'individual',
    incomeCategory: 'sec_40_2',
    whtCondition: 'pay_once',
    filingSequence: 7,
    payer: { name: 'บริษัท ทดสอบ จำกัด', taxId: '0105555000000', address: 'กรุงเทพฯ', branchLabel: 'สำนักงานใหญ่' },
    payee: { name: 'นายสมชาย ใจดี', taxId: '1100000000001', address: '—', branchLabel: null },
  }

  it('ประกอบ 2 ฉบับ + ลำดับที่ + ติ๊กแบบ/เงื่อนไขตามจริง + ยอดลงแถวเดียว + ตัวอักษร + วันที่ออก พ.ศ.', () => {
    const doc = buildWhtCertificateDoc(source)
    expect(doc.copies.map((copy) => copy.label)).toEqual(['ฉบับที่ 1', 'ฉบับที่ 2'])
    expect(doc.copies[0]?.purpose).toContain('แนบพร้อมกับแบบแสดงรายการภาษี')
    expect(doc.copies[1]?.purpose).toContain('เก็บไว้เป็นหลักฐาน')
    expect(doc.filingSequenceText).toBe('7')
    expect(doc.filingBoxes).toHaveLength(7)
    expect(doc.filingBoxes.filter((box) => box.checked).map((box) => box.label)).toEqual(['(1) ภ.ง.ด.1ก'])
    expect(doc.conditionBoxes.filter((box) => box.checked).map((box) => box.label)).toEqual(['(3) ออกให้ครั้งเดียว'])
    const filled = doc.incomeLines.filter((line) => line.grossText !== '')
    expect(filled.map((line) => line.no)).toEqual(['2'])
    expect(filled[0]).toMatchObject({ dateText: '05/10/2569', grossText: '1,350.00', whtText: '40.50' })
    expect(doc.incomeLines).toHaveLength(6)
    expect(doc.whtInWordsText).toBe('สี่สิบบาทห้าสิบสตางค์')
    expect(doc.issueDateLabel).toBe('06/10/2569')
  })

  it('ลำดับที่หาไม่ได้พิมพ์ขีด · ข้อความบนเอกสารไม่มีเลขอ้างอิงสเปค', () => {
    const doc = buildWhtCertificateDoc({ ...source, filingSequence: null })
    expect(doc.filingSequenceText).toBe('—')
    const printed = JSON.stringify(doc)
    expect(printed).not.toMatch(/§|ไฟล์ \d{2}|`\d{2}`/)
  })
})

describe('ที่อยู่บรรทัดเดียวบนเอกสาร (U94 ข้อ 1)', () => {
  it('ต่างจังหวัดใช้ ต./อ./จ. · กรุงเทพฯ ใช้แขวง/เขต · ไม่เติมคำนำหน้าซ้ำ', () => {
    expect(
      formatThaiAddressLine({
        detail: '12 ม.3',
        subdistrict: 'ป่าแดด',
        district: 'เมืองเชียงใหม่',
        province: 'เชียงใหม่',
        postalCode: '50100',
      }),
    ).toBe('12 ม.3 ต.ป่าแดด อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50100')
    expect(
      formatThaiAddressLine({
        detail: '99/1 ถ.สุขุมวิท',
        subdistrict: 'คลองเตย',
        district: 'เขตคลองเตย',
        province: 'กรุงเทพมหานคร',
        postalCode: '10110',
      }),
    ).toBe('99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110')
  })

  it('ช่องว่างถูกข้าม · ว่างทั้งชุด = null', () => {
    expect(
      formatThaiAddressLine({ detail: ' 5 ', subdistrict: null, district: '', province: 'ภูเก็ต', postalCode: null }),
    ).toBe('5 จ.ภูเก็ต')
    expect(
      formatThaiAddressLine({ detail: null, subdistrict: null, district: null, province: null, postalCode: null }),
    ).toBeNull()
    expect(formatThaiAddressLine(null)).toBeNull()
  })
})

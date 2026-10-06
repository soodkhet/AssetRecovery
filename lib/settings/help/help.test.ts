import { describe, expect, it } from 'vitest'
import type { ApprovalMatrixCandidate } from '@/lib/finance/approval-flow-resolver'
import { DEFAULT_WHT_POLICY } from '@/lib/settings/wht-policy'
import {
  advancePolicyHelp,
  agingBucketsHelp,
  allowanceHelp,
  approvalMatrixHelp,
  bankAccountsHelp,
  bankFileFormatsHelp,
  commissionHelp,
  companyBillingHelp,
  companyBranchHelp,
  companyVatModeHelp,
  costCentersHelp,
  customerWhtHelp,
  cycleDueHelp,
  dataRetentionHelp,
  debtorDocumentPurgeDate,
  documentNumberingHelp,
  exportFormatsHelp,
  fuelHelp,
  holidaysHelp,
  hotelCapHelp,
  intFromInput,
  internalDocumentsHelp,
  organizationProfileHelp,
  payeeConditionHelp,
  payeeIdDocumentHelp,
  payeeTaxProfileHelp,
  payeeWht402Help,
  pctFromInput,
  periodLockHelp,
  planWhtHelp,
  satangFromInput,
  serviceFeeHelp,
  slaPolicyHelp,
  substituteReceiptHelp,
  taxDocTemplateHelp,
  taxProfileHelp,
  vatModeTable,
  vatRateHelp,
  whtBaseHelp,
  whtCertificateModeHelp,
  whtConditionTable,
  whtFilingMethodHelp,
  whtGrossUpHelp,
  whtIncomeTypeHelp,
  whtZeroRateHelp,
  writeOffToleranceHelp,
  type SettingHelpContent,
} from '@/lib/settings/help'
import { fmtDate } from '@/lib/format/datetime'

/**
 * คำอธิบายค่าตั้ง (มติ PO 06/10/2569 U108) — ตัวเลขตัวอย่างต้องตรงกับสูตรจริง และข้อความต้องไม่มีเลขอ้างอิงสเปค (Rule 05)
 */

function valueOf(help: SettingHelpContent, label: string, exampleIndex = 0): string | undefined {
  return help.examples?.[exampleIndex]?.lines.find((each) => each.label.includes(label))?.value
}

const DEFAULT_PROFILE = { whtPct: 3, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }

describe('WHT — ตัวอย่างตัวเลขจากสูตรจริง', () => {
  it('Tax Profile: เงินได้ ฿10,000 อัตรา 3% → หัก ฿300 ได้รับ ฿9,700', () => {
    const help = taxProfileHelp({ whtPct: 3, whtBasis: 'before_vat', thresholdSatang: 100_000 })
    expect(valueOf(help, 'ภาษีที่หัก')).toBe('฿300.00')
    expect(valueOf(help, 'ผู้รับได้รับ')).toBe('฿9,700.00')
  })

  it('เกณฑ์ ฿1,000: ฿950 ไม่หัก · ฿1,200 หัก ฿36', () => {
    const help = taxProfileHelp({ whtPct: 3, whtBasis: 'before_vat', thresholdSatang: 100_000 })
    expect(valueOf(help, '฿950.00', 1)).toBe('ไม่หัก (ต่ำกว่าเกณฑ์)')
    expect(valueOf(help, '฿1,200.00', 1)).toBe('หัก ฿36.00')
  })

  it('อัปเดตสดตามอัตรา/เกณฑ์ที่พิมพ์ (5% · เกณฑ์ ฿900 ⇒ ฿950 ถูกหัก)', () => {
    const help = taxProfileHelp({ whtPct: 5, whtBasis: 'before_vat', thresholdSatang: 90_000 })
    expect(valueOf(help, 'ภาษีที่หัก')).toBe('฿500.00')
    expect(valueOf(help, '฿950.00', 1)).toBe('หัก ฿47.50')
  })

  it('ตาราง (1)/(2)/(3): ฿10,000 อัตรา 3%', () => {
    const table = whtConditionTable(1_000_000, 3)
    expect(table?.rows).toEqual([
      ['(1) หัก ณ ที่จ่าย', '฿300.00', '฿10,000.00', '฿9,700.00', '฿10,000.00'],
      ['(2) ออกให้ตลอดไป', '฿309.28', '฿10,309.28', '฿10,000.00', '฿10,309.28'],
      ['(3) ออกให้ครั้งเดียว', '฿300.00', '฿10,300.00', '฿10,000.00', '฿10,300.00'],
    ])
    expect(whtGrossUpHelp(false).table).toEqual(table)
  })

  it('เงื่อนไขของผู้รับตามที่เลือก + อัตรา Tax Profile ที่เลือก', () => {
    const pay = payeeConditionHelp({ condition: 'pay_always', allowGrossUp: true, whtPct: 3 })
    expect(valueOf(pay, 'ภาษีที่นำส่ง')).toBe('฿309.28')
    expect(valueOf(pay, 'ผู้รับได้รับ')).toBe('฿10,000.00')
    const withhold = payeeConditionHelp({ condition: 'withhold', allowGrossUp: false, whtPct: 5 })
    expect(valueOf(withhold, 'ผู้รับได้รับ')).toBe('฿9,500.00')
    expect(withhold.examples?.[0]?.note).toContain('ยังไม่อนุญาต')
  })

  it('ฐาน WHT: ค่าที่พักไม่อยู่ในฐาน (ค่าเริ่มต้น) ⇒ หักเฉพาะคอมมิชชั่น', () => {
    const help = whtBaseHelp(DEFAULT_WHT_POLICY.baseExpenseTypes)
    expect(valueOf(help, 'ฐานภาษี')).toBe('฿10,000.00')
    expect(valueOf(help, 'ภาษีที่หัก')).toBe('฿300.00')
    expect(valueOf(help, 'ผู้รับได้รับ')).toBe('฿11,300.00')
    const all = whtBaseHelp([...DEFAULT_WHT_POLICY.baseExpenseTypes, 'hotel'])
    expect(valueOf(all, 'ฐานภาษี')).toBe('฿11,600.00')
    expect(valueOf(all, 'ภาษีที่หัก')).toBe('฿348.00')
  })

  it('50 ทวิ ต่อรอบ = 1 ใบ · ต่อรายการ = 3 ใบ (ภาษีรวมเท่ากัน — เกณฑ์เทียบยอดรวมของผู้รับในรอบ)', () => {
    const help = whtCertificateModeHelp('per_payee_batch')
    expect(valueOf(help, 'ต่อผู้รับต่อรอบจ่าย')).toBe('1 ใบ')
    expect(valueOf(help, 'ต่อรายการ')).toBe('3 ใบ')
    expect(valueOf(help, 'ภาษีรวม')).toBe('฿364.50')
  })

  it('ประเภทเงินได้แยกตามทีม: Inhouse 40(2) ภ.ง.ด.1 · Outsource 40(8) ภ.ง.ด.3 · นิติบุคคล ภ.ง.ด.53', () => {
    const help = whtIncomeTypeHelp({
      incomeTypeMode: 'by_team_side',
      inhouseIncomeCategory: 'sec_40_2',
      outsourceIncomeCategory: 'sec_40_8',
    })
    expect(valueOf(help, 'Inhouse')).toContain('มาตรา 40(2) · ภ.ง.ด.1')
    expect(valueOf(help, 'Outsource (บุคคลธรรมดา)')).toContain('มาตรา 40(8) · ภ.ง.ด.3')
    expect(valueOf(help, 'นิติบุคคล')).toContain('ภ.ง.ด.53')
  })

  it('ใบ 0%: เปิด = ออก · ปิด = ไม่ออก', () => {
    expect(valueOf(whtZeroRateHelp(true), 'ผลตามค่าที่เลือก')).toBe('ออก 50 ทวิ (ภาษี 0)')
    expect(valueOf(whtZeroRateHelp(false), 'ผลตามค่าที่เลือก')).toBe('ไม่ออก 50 ทวิ')
  })

  it('กำหนดยื่นงวด ต.ค. 2569: 15/11 ตรงอาทิตย์ → 16/11 · 7/11 ตรงเสาร์ → 09/11 · เลื่อนต่อตามวันหยุด', () => {
    const help = whtFilingMethodHelp('online')
    expect(valueOf(help, 'ยื่นออนไลน์')).toBe('15/11/2569 → 16/11/2569 (เลื่อนจากวันหยุด)')
    expect(valueOf(help, 'ยื่นแบบกระดาษ')).toBe('07/11/2569 → 09/11/2569 (เลื่อนจากวันหยุด)')
    const holidays = holidaysHelp(['2026-11-16'])
    expect(valueOf(holidays, 'ยื่นออนไลน์')).toBe('15/11/2569 → 17/11/2569 (เลื่อนจากวันหยุด)')
  })

  it('ผู้รับ: Tax Profile ที่เลือก / ยังไม่ผูก · อัตรา 40(2) ต่อคน', () => {
    expect(valueOf(payeeTaxProfileHelp(DEFAULT_PROFILE), 'ภาษีที่หัก')).toBe('฿300.00')
    expect(payeeTaxProfileHelp(null).examples).toEqual([])
    expect(valueOf(payeeWht402Help(2.5), 'ภาษีที่หัก')).toBe('฿250.00')
    expect(payeeWht402Help(null).examples).toEqual([])
  })

  it('อัตราของแผน: ใช้เมื่อยังไม่ผูก Tax Profile', () => {
    expect(valueOf(planWhtHelp(1), 'ใช้อัตราของแผน')).toBe('หัก ฿100.00')
  })
})

describe('VAT / การวางบิล', () => {
  it('ค่าบริการ ฿1,000 อัตรา 7%: รวม/ไม่รวม/ไม่คิด VAT', () => {
    expect(vatModeTable(7).rows).toEqual([
      ['ราคารวม VAT แล้ว', '฿934.58', '฿65.42', '฿1,000.00'],
      ['ราคายังไม่รวม VAT (บวกเพิ่ม)', '฿1,000.00', '฿70.00', '฿1,070.00'],
      ['ไม่คิด VAT', '฿1,000.00', '฿0.00', '฿1,000.00'],
    ])
    expect(vatRateHelp(10).table?.rows[1]).toEqual(['ราคายังไม่รวม VAT (บวกเพิ่ม)', '฿1,000.00', '฿100.00', '฿1,100.00'])
    expect(companyVatModeHelp('include_vat', null).table?.rows[0]).toEqual(['ราคารวม VAT แล้ว', '—', '—', '—'])
  })

  it('ลูกค้าหัก 3%: บิล ฿1,070 → หัก ฿30 → คาดรับ ฿1,040', () => {
    const help = customerWhtHelp({ whtPct: 3, vatMode: 'exclude_vat', vatRatePct: 7 })
    expect(valueOf(help, 'ยอดเรียกเก็บรวม')).toBe('฿1,070.00')
    expect(valueOf(help, 'ภาษีที่ลูกค้าหัก')).toBe('฿30.00')
    expect(valueOf(help, 'คาดว่าจะได้รับ')).toBe('฿1,040.00')
    const none = customerWhtHelp({ whtPct: null, vatMode: 'no_vat', vatRatePct: null })
    expect(valueOf(none, 'คาดว่าจะได้รับ')).toBe('฿1,000.00')
  })

  it('รอบบิลที่บริษัทใช้ (มติ U146): ตัดรอบวันที่ 25 + Net 30 วัน → 24/11/2569', () => {
    const cycle = { name: 'รอบหลัก', cutoffRuleType: 'fixed_dates' as const, cutoffDates: [25], dueRuleType: 'net_days' as const, dueRuleValue: 30 }
    const help = companyBillingHelp(cycle)
    expect(valueOf(help, 'วันตัดรอบ')).toBe('25/10/2569')
    expect(valueOf(help, 'ครบกำหนดชำระ')).toBe('24/11/2569')
    expect(companyBillingHelp(null).examples).toEqual([])
  })

  it('รอบบิล: วันที่ 5 ของเดือนถัดไป / สิ้นเดือน', () => {
    expect(valueOf(cycleDueHelp({ dueRuleType: 'day_of_next_month', dueRuleValue: 5, cutoffDay: 25 }), 'ครบกำหนด')).toBe(
      '05/11/2569',
    )
    expect(valueOf(cycleDueHelp({ dueRuleType: 'month_end', dueRuleValue: null, cutoffDay: 10 }), 'ครบกำหนด')).toBe(
      '31/10/2569',
    )
    expect(cycleDueHelp({ dueRuleType: 'net_days', dueRuleValue: null, cutoffDay: 10 }).examples).toEqual([])
  })
})

describe('เอกสาร / ระยะเก็บ', () => {
  it('เลขที่เอกสาร: ตัวอย่างเลขถัดไป + ขึ้นปีใหม่รีเซ็ต', () => {
    const help = documentNumberingHelp({
      docType: 'wht_certificate',
      state: { prefix: 'WHT', includeYear: true, digits: 3, resetYearly: true, currentSeq: 15, currentYear: 2569 },
      formatLocked: true,
      at: new Date('2026-10-06T03:00:00Z'),
    })
    expect(valueOf(help, 'เลขถัดไป')).toBe('WHT-2569-016')
    expect(valueOf(help, 'ขึ้นปีใหม่')).toBe('WHT-2570-001')
    expect(help.when).toContain('ล็อกแล้ว')
    const invoice = documentNumberingHelp({
      docType: 'tax_invoice',
      state: { prefix: 'INV', includeYear: false, digits: 4, resetYearly: false, currentSeq: 9, currentYear: 2569 },
      formatLocked: false,
      at: new Date('2026-10-06T03:00:00Z'),
    })
    expect(valueOf(invoice, 'เลขถัดไป')).toBe('INV-0010')
    expect(valueOf(invoice, 'ขึ้นปีใหม่')).toBe('INV-0010')
    expect(invoice.when).toContain('ล็อกรูปแบบทันทีหลังออกฉบับแรก')
  })

  it('ระยะเก็บ: ปิดเคส 06/10/2569 + 5 ปี → ลบ 07/10/2574', () => {
    const help = dataRetentionHelp(5)
    expect(valueOf(help, 'ลบไฟล์')).toBe('07/10/2574')
    const date = debtorDocumentPurgeDate(new Date('2026-10-06T03:00:00Z'), 1)
    expect(date === null ? null : fmtDate(date)).toBe('07/10/2570')
    expect(dataRetentionHelp(0).examples).toEqual([])
    expect(dataRetentionHelp(null).examples).toEqual([])
  })
})

describe('นโยบายการเงิน / สายอนุมัติ / แผนค่าตอบแทน', () => {
  it('เพดานใบรับรองแทนใบเสร็จ ฿500/ใบ ฿3,000/เดือน', () => {
    const help = substituteReceiptHelp(50_000, 300_000)
    const lines = help.examples?.[0]?.lines ?? []
    expect(lines[0]?.value).toBe('ออกได้')
    expect(lines[1]?.value).toContain('เกินเพดานต่อใบ ฿500.00')
    expect(lines[2]?.value).toContain('ออกได้อีกไม่เกิน ฿200.00')
    expect(substituteReceiptHelp(null, 300_000).examples).toEqual([])
  })

  it('เงินทดรอง: เพดาน ฿3,000 ขอ ฿5,000 ไม่ได้ · ใช้ ฿4,200 คืน ฿800', () => {
    const help = advancePolicyHelp({ maxSatang: 300_000 })
    expect(valueOf(help, 'ผลการขอเบิก')).toBe('เกินเพดาน — ส่งคำขอไม่ได้')
    expect(valueOf(help, 'ใช้จริง')).toBe('ต้องคืน ฿800.00')
    expect(valueOf(advancePolicyHelp({ maxSatang: null }), 'ผลการขอเบิก')).toBe('ขอได้')
  })

  it('ตัดส่วนต่าง: ส่วนต่าง ฿30 กับเพดาน ฿50 / ฿20', () => {
    expect(valueOf(writeOffToleranceHelp(5_000), 'เทียบเพดาน')).toBe('ตัดเป็นค่าธรรมเนียมได้')
    expect(valueOf(writeOffToleranceHelp(2_000), 'เทียบเพดาน')).toContain('เกินเพดาน')
  })

  it('ช่วงอายุหนี้ 30/60/90', () => {
    const help = agingBucketsHelp([30, 60, 90])
    expect(valueOf(help, '45 วัน')).toBe('31-60 วัน')
    expect(valueOf(help, '120 วัน')).toBe('90+ วัน')
    expect(agingBucketsHelp([30, 30]).examples).toEqual([])
  })

  it('สายอนุมัติ: เลือกสายเพดานต่ำสุดที่ครอบยอด · ไม่มีสายครอบ = แจ้ง', () => {
    const matrices: ApprovalMatrixCandidate[] = [
      { id: 'a', condition: 'ยอดเล็ก', conditionThresholdSatang: 100_000, approvalFlow: ['การเงิน'], enforceSegregationOfDuties: true },
      { id: 'b', condition: 'ยอดกลาง', conditionThresholdSatang: 1_000_000, approvalFlow: ['การเงิน', 'บริหาร'], enforceSegregationOfDuties: true },
    ]
    const help = approvalMatrixHelp(matrices)
    expect(valueOf(help, '฿500.00')).toBe('ยอดเล็ก · การเงิน')
    expect(valueOf(help, '฿5,000.00')).toBe('ยอดกลาง · การเงิน → บริหาร')
    expect(valueOf(help, '฿50,000.00')).toContain('ไม่มีสายที่ครอบยอดนี้')
    expect(approvalMatrixHelp([]).examples).toEqual([])
  })

  it('เพดานค่าที่พัก 2 คืน × ฿800 = ฿1,600', () => {
    const help = hotelCapHelp(80_000)
    expect(valueOf(help, 'เบิกได้ไม่เกิน')).toBe('฿1,600.00')
    expect(valueOf(help, 'ถ้าเบิก ฿1,700.00')).toContain('800.00 บาท/คืน × 2 คืน = 1,600.00 บาท')
    expect(hotelCapHelp(null).examples).toEqual([])
  })

  it('ค่าน้ำมันตามระยะทาง (เพดาน) / เหมาจ่ายรายวัน', () => {
    const perKm = fuelHelp({ fuelMode: 'PER_KM', ratePerKmSatang: 700, maxPerCaseSatang: 50_000, dailyFlatSatang: null })
    expect(valueOf(perKm, 'คิดตามระยะทาง')).toBe('฿840.00')
    expect(valueOf(perKm, 'จ่ายจริง')).toBe('฿500.00')
    const daily = fuelHelp({ fuelMode: 'DAILY_FLAT', ratePerKmSatang: null, maxPerCaseSatang: null, dailyFlatSatang: 40_000 })
    expect(valueOf(daily, 'รวม 3 วัน')).toBe('฿1,200.00')
  })

  it('เบี้ยเลี้ยงวันเดียว 3 เคส: เศษสตางค์ลงเคสแรก', () => {
    const help = allowanceHelp(10_000)
    expect(valueOf(help, 'ได้รับรวม')).toBe('฿100.00')
    expect(valueOf(help, 'แบ่งลงเคส')).toBe('เคส A ฿33.34 · เคส B ฿33.33 · เคส C ฿33.33')
  })

  it('คอมมิชชั่น/เบี้ยเสี่ยง', () => {
    const help = commissionHelp(150_000, 0)
    expect(valueOf(help, 'ปิดสำเร็จ')).toBe('฿1,500.00')
    expect(valueOf(help, 'ปิดไม่สำเร็จ')).toBe('ไม่มีรายการ')
  })

  it('เทมเพลตค่าบริการ: HYBRID ฿3,000 + 10% ของมูลหนี้ ฿50,000', () => {
    const help = serviceFeeHelp({ model: 'HYBRID', baseSatang: 300_000, ratePct: 10, basis: 'debt_amount', chargeOnFail: true })
    expect(valueOf(help, 'ปิดสำเร็จ')).toBe('฿8,000.00')
    expect(valueOf(help, 'ปิดไม่สำเร็จ')).toBe('฿3,000.00')
    const success = serviceFeeHelp({ model: 'SUCCESS_FEE', baseSatang: null, ratePct: 5, basis: 'debt_amount', chargeOnFail: false })
    expect(valueOf(success, 'ปิดสำเร็จ')).toBe('฿2,500.00')
    expect(valueOf(success, 'ปิดไม่สำเร็จ')).toBe('฿0.00')
    expect(serviceFeeHelp({ model: 'FLAT', baseSatang: null, ratePct: null, basis: 'debt_amount', chargeOnFail: false }).examples).toEqual([])
  })

  it('SLA 72 ชม. จากเคสสร้าง 06/10/2569 09:00', () => {
    expect(valueOf(slaPolicyHelp(72), 'ขึ้นรายงานเกิน SLA')).toBe('09/10/2569 09:00')
    expect(slaPolicyHelp(null).examples).toEqual([])
  })
})

describe('ตัวแปลงค่าที่กำลังพิมพ์', () => {
  it('บาท/เปอร์เซ็นต์/จำนวนเต็ม', () => {
    expect(satangFromInput('1,600.50')).toBe(160_050)
    expect(satangFromInput('')).toBeNull()
    expect(satangFromInput('1.234')).toBeNull()
    expect(satangFromInput('-5')).toBeNull()
    expect(pctFromInput('3')).toBe(3)
    expect(pctFromInput('101')).toBeNull()
    expect(pctFromInput('abc')).toBeNull()
    expect(intFromInput('30')).toBe(30)
    expect(intFromInput('3.5')).toBeNull()
  })
})

describe('ข้อความที่ผู้ใช้เห็น', () => {
  const all: SettingHelpContent[] = [
    whtBaseHelp(DEFAULT_WHT_POLICY.baseExpenseTypes),
    whtCertificateModeHelp('per_item'),
    whtIncomeTypeHelp(DEFAULT_WHT_POLICY),
    whtZeroRateHelp(true),
    whtGrossUpHelp(true),
    whtFilingMethodHelp('paper'),
    taxProfileHelp({ whtPct: 3, whtBasis: 'gross_amount', thresholdSatang: 100_000 }),
    payeeTaxProfileHelp(DEFAULT_PROFILE),
    payeeWht402Help(0),
    payeeConditionHelp({ condition: 'pay_once', allowGrossUp: true, whtPct: 3 }),
    planWhtHelp(3),
    vatRateHelp(7),
    companyVatModeHelp('exclude_vat', 7),
    customerWhtHelp({ whtPct: 3, vatMode: 'include_vat', vatRatePct: 7 }),
    companyBranchHelp(),
    companyBillingHelp({ name: 'รอบสิ้นเดือน', cutoffRuleType: 'month_end', cutoffDates: [], dueRuleType: 'net_days', dueRuleValue: 30 }),
    cycleDueHelp({ dueRuleType: 'net_days', dueRuleValue: 30, cutoffDay: 31 }),
    documentNumberingHelp({
      docType: 'billing_batch',
      state: { prefix: 'BL', includeYear: true, digits: 3, resetYearly: true, currentSeq: 1, currentYear: 2569 },
      formatLocked: false,
      at: new Date(),
    }),
    dataRetentionHelp(5),
    taxDocTemplateHelp(),
    internalDocumentsHelp(),
    exportFormatsHelp(),
    organizationProfileHelp(),
    approvalMatrixHelp([
      { id: 'a', condition: 'ทุกยอด', conditionThresholdSatang: null, approvalFlow: ['การเงิน'], enforceSegregationOfDuties: false },
    ]),
    advancePolicyHelp({ maxSatang: 500_000 }),
    substituteReceiptHelp(50_000, 300_000),
    writeOffToleranceHelp(5_000),
    agingBucketsHelp([30, 60, 90]),
    payeeIdDocumentHelp(false),
    periodLockHelp(),
    bankAccountsHelp(),
    bankFileFormatsHelp(),
    costCentersHelp(),
    holidaysHelp([]),
    slaPolicyHelp(72),
    fuelHelp({ fuelMode: 'PER_KM', ratePerKmSatang: 700, maxPerCaseSatang: null, dailyFlatSatang: null }),
    allowanceHelp(30_000),
    hotelCapHelp(80_000),
    commissionHelp(150_000, 50_000),
    serviceFeeHelp({ model: 'FLAT', baseSatang: 300_000, ratePct: null, basis: 'debt_amount', chargeOnFail: true }),
  ]

  it.each(all.map((help) => [help.title, help] as const))('"%s" ไม่มีเลขอ้างอิงสเปค และตอบครบ 4 คำถาม', (_title, help) => {
    const text = JSON.stringify(help)
    expect(text).not.toMatch(/§|ไฟล์ \d|`\d\d`/)
    expect(help.what.length).toBeGreaterThan(20)
    expect(help.who.length).toBeGreaterThan(0)
    expect(help.when.length).toBeGreaterThan(0)
    // ไม่หลุดค่าดิบภาษาโปรแกรม/ชื่อคอลัมน์
    expect(text).not.toMatch(/undefined|NaN|null|_satang|_pct/)
  })

  it('ครอบค่าตั้งที่กระทบเงินด้วยตัวอย่างตัวเลข', () => {
    const withNumbers = all.filter((help) => (help.examples ?? []).some((example) => example.lines.length > 0) || help.table !== undefined)
    expect(withNumbers.length).toBeGreaterThanOrEqual(28)
  })
})

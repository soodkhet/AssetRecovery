import { describe, expect, it } from 'vitest'
import {
  buildCompensationReport,
  isReceiptExpense,
  type CompensationItemEntry,
} from '@/lib/reports/finance/compensation-report'
import { ROW_KEY } from '@/lib/reports/payload'
import { DEFAULT_WHT_POLICY, LEGACY_WHT_POLICY } from '@/lib/settings/wht-policy'

/** F4 (`96` §6-F4) — สรุปค่าตอบแทนจาก snapshot ของรายการในรอบจ่าย (`92` §7.1) */

function item(overrides: Partial<CompensationItemEntry> & { payeeId: string }): CompensationItemEntry {
  return {
    payeeName: `พนักงาน ${overrides.payeeId}`,
    teamId: 't1',
    teamName: 'ทีมเหนือ',
    teamSide: 'inhouse',
    expenseType: 'commission',
    caseId: 'case-1',
    receiptExpense: false,
    whtCondition: 'withhold',
    grossSatang: 100_000,
    whtSatang: 3_000,
    netSatang: 97_000,
    ...overrides,
  }
}

const ITEMS: CompensationItemEntry[] = [
  item({ payeeId: 'p1', caseId: 'case-1', expenseType: 'commission', grossSatang: 500_000, whtSatang: 15_000, netSatang: 485_000 }),
  item({ payeeId: 'p1', caseId: 'case-1', expenseType: 'fuel', grossSatang: 20_000, whtSatang: 0, netSatang: 20_000 }),
  item({ payeeId: 'p2', caseId: 'case-2', expenseType: 'allowance', grossSatang: 30_000, whtSatang: 0, netSatang: 30_000 }),
  item({
    payeeId: 'p3',
    teamId: 't2',
    teamName: 'ทีมใต้',
    teamSide: 'outsource',
    caseId: 'case-3',
    expenseType: 'no_success_fee',
    grossSatang: 40_000,
    whtSatang: 1_200,
    netSatang: 38_800,
  }),
]

describe('F4 — ตารางรายทีม', () => {
  const data = buildCompensationReport({ groupBy: 'team', items: ITEMS })

  it('คอลัมน์ตาม `96` §6-F4 และเรียงจากยอดมากไปน้อย', () => {
    expect(data.columns.map((column) => column.header)).toEqual([
      'ทีม',
      'ประเภท',
      'จำนวนคน',
      'ค่าตอบแทน',
      'ภาษีที่บริษัทออกให้',
      'ค่าใช้จ่ายตามใบเสร็จ',
      'Gross รวม',
      'WHT หักจากผู้รับ',
      'Net รวม',
      'จำนวนเคสที่ปิด',
    ])
    expect(data.rows.map((row) => row[ROW_KEY])).toEqual(['t1', 't2'])
  })

  it('จำนวนคน/จำนวนเคส นับแบบไม่ซ้ำ', () => {
    expect(data.rows[0]).toMatchObject({
      group: 'ทีมเหนือ',
      teamSide: 'Inhouse',
      memberCount: 2,
      caseCount: 2,
      grossSatang: 550_000,
      whtSatang: 15_000,
      netSatang: 535_000,
    })
  })

  it('ไม่มีทีม ⇒ จัดกลุ่มเป็น "ไม่สังกัดทีม" ไม่ใช่ทิ้งแถว', () => {
    const orphan = buildCompensationReport({
      groupBy: 'team',
      items: [item({ payeeId: 'p9', teamId: null, teamName: null, teamSide: null })],
    })

    expect(orphan.rows[0]).toMatchObject({ group: 'ไม่สังกัดทีม', teamSide: null })
  })

  it('KPI 3 ตัวตรงกับผลรวมของรายการทั้งหมด', () => {
    const kpi = (key: string) => data.kpis?.find((item) => item.key === key)?.value

    expect(kpi('compensation')).toBe(590_000)
    expect(kpi('receipt')).toBe(0)
    expect(kpi('wht')).toBe(16_200)
    expect(kpi('net')).toBe(573_800)
    expect(data.totalRow).toMatchObject({ memberCount: 3, caseCount: 3, grossSatang: 590_000 })
  })
})

describe('F4 — ตารางรายพนักงาน (drill-down)', () => {
  const data = buildCompensationReport({ groupBy: 'employee', items: ITEMS })

  it('แยกช่องตามชนิดรายการ และชนิดอื่นไปรวมช่อง "อื่น ๆ" (ผลรวมยังตรง Gross)', () => {
    expect(data.rows[0]).toMatchObject({
      group: 'พนักงาน p1',
      teamName: 'ทีมเหนือ',
      caseCount: 1,
      commissionSatang: 500_000,
      fuelSatang: 20_000,
      allowanceSatang: 0,
      otherSatang: 0,
      grossSatang: 520_000,
    })

    // เบี้ยเสี่ยงลงช่องเดียวกับคอมมิชชั่น (`22` §6.4 คู่ exclusive · มติ PO 03/10/2569 UAT Q2)
    const outsourced = data.rows.find((row) => row[ROW_KEY] === 'p3')
    expect(outsourced).toMatchObject({ commissionSatang: 40_000, otherSatang: 0, grossSatang: 40_000 })
  })

  it('แถวรวมของช่องย่อยบวกกันได้เท่ากับ Gross รวม', () => {
    const total = data.totalRow
    const sumOfParts =
      Number(total?.['commissionSatang']) +
      Number(total?.['fuelSatang']) +
      Number(total?.['allowanceSatang']) +
      Number(total?.['otherSatang'])

    expect(sumOfParts).toBe(Number(total?.['grossSatang']))
  })

  it('ห้ามคำนวณ Net ใหม่จาก Gross − WHT — ต้องใช้ค่าที่ snapshot ไว้', () => {
    // รายการที่ปัดเศษไว้ตอนสร้างรอบจ่าย: net ที่บันทึกไว้ไม่เท่ากับ gross − wht เป๊ะ ๆ
    const snapshot = buildCompensationReport({
      groupBy: 'employee',
      items: [item({ payeeId: 'p1', grossSatang: 100_000, whtSatang: 3_000, netSatang: 96_500 })],
    })

    expect(snapshot.rows[0]?.['netSatang']).toBe(96_500)
    expect(snapshot.kpis?.find((kpi) => kpi.key === 'net')?.value).toBe(96_500)
  })
})

// ── มติ PO U53 — ค่าใช้จ่ายตามใบเสร็จแยกคอลัมน์จากค่าตอบแทน ────────────────────────

describe('F4 — ค่าใช้จ่ายตามใบเสร็จ (U53)', () => {
  it('ตัวจำแนก = ไม่อยู่ในฐาน WHT ตามค่าตั้งของรอบ (ตัวเดียวกับ U3) — ไม่ hardcode ชนิด', () => {
    expect(isReceiptExpense(DEFAULT_WHT_POLICY, 'hotel')).toBe(true)
    expect(isReceiptExpense(DEFAULT_WHT_POLICY, 'receipt')).toBe(true)
    expect(isReceiptExpense(DEFAULT_WHT_POLICY, 'manual')).toBe(true)
    expect(isReceiptExpense(DEFAULT_WHT_POLICY, 'commission')).toBe(false)
    expect(isReceiptExpense(DEFAULT_WHT_POLICY, 'fuel')).toBe(false)
    // ค่าตั้งที่องค์กรเลือกเอง: เอาน้ำมันออกจากฐาน ⇒ น้ำมันกลายเป็นค่าใช้จ่ายตามใบเสร็จ
    expect(isReceiptExpense({ baseExpenseTypes: ['commission'] }, 'fuel')).toBe(true)
    // รอบก่อนมีค่าตั้ง (ทุกชนิดในฐาน) ⇒ ไม่มีรายการไหนถูกย้ายช่อง
    expect(isReceiptExpense(LEGACY_WHT_POLICY, 'hotel')).toBe(false)
    // หาชนิดต้นทางไม่เจอ ⇒ คงเป็นค่าตอบแทน
    expect(isReceiptExpense(DEFAULT_WHT_POLICY, null)).toBe(false)
  })

  const WITH_RECEIPTS: CompensationItemEntry[] = [
    ...ITEMS,
    item({ payeeId: 'p1', caseId: null, expenseType: 'hotel', receiptExpense: true, grossSatang: 80_000, whtSatang: 0, netSatang: 80_000 }),
    item({ payeeId: 'p2', caseId: null, expenseType: 'receipt', receiptExpense: true, grossSatang: 30_000, whtSatang: 0, netSatang: 30_000 }),
  ]

  it('รายทีม: แยก "ค่าตอบแทน" กับ "ค่าใช้จ่ายตามใบเสร็จ" · Gross/WHT/Net รวมเท่าเดิม', () => {
    const data = buildCompensationReport({ groupBy: 'team', items: WITH_RECEIPTS })
    expect(data.rows[0]).toMatchObject({
      group: 'ทีมเหนือ',
      compensationSatang: 550_000,
      receiptSatang: 110_000,
      grossSatang: 660_000,
      whtSatang: 15_000,
      netSatang: 645_000,
      caseCount: 2,
    })
    expect(data.totalRow).toMatchObject({ compensationSatang: 590_000, receiptSatang: 110_000, grossSatang: 700_000 })
    const kpi = (key: string) => data.kpis?.find((entry) => entry.key === key)?.value
    expect(kpi('compensation')).toBe(590_000)
    expect(kpi('receipt')).toBe(110_000)
    expect(Number(kpi('compensation')) + Number(kpi('receipt'))).toBe(700_000)
    expect(kpi('net')).toBe(683_800)
  })

  it('รายพนักงาน: ค่าที่พักไม่ตกช่อง "อื่น ๆ" แต่ลงช่องค่าใช้จ่ายตามใบเสร็จ · ผลรวมช่องย่อย = Gross', () => {
    const data = buildCompensationReport({ groupBy: 'employee', items: WITH_RECEIPTS })
    expect(data.columns.map((column) => column.header)).toContain('ค่าใช้จ่ายตามใบเสร็จ')
    expect(data.rows.find((row) => row[ROW_KEY] === 'p1')).toMatchObject({
      commissionSatang: 500_000,
      fuelSatang: 20_000,
      otherSatang: 0,
      receiptSatang: 80_000,
      grossSatang: 600_000,
    })
    const total = data.totalRow
    const parts = ['commissionSatang', 'fuelSatang', 'allowanceSatang', 'otherSatang', 'receiptSatang'].reduce(
      (sum, key) => sum + Number(total?.[key]),
      0,
    )
    expect(parts).toBe(Number(total?.['grossSatang']))
    expect(total?.['receiptSatang']).toBe(110_000)
  })
})

// ── มติ PO U109 — ภาษีที่บริษัทออกให้แยกคอลัมน์จากค่าตอบแทน ──────────────────────

describe('F4 — ภาษีที่บริษัทออกให้ (U109)', () => {
  // เงินได้ ฿10,000 อัตรา 3% ต่อคน: (1) หัก 300 โอน 9,700 · (2) gross 10,309.28 ภาษีออกให้ 309.28 · (3) gross 10,300 ภาษีออกให้ 300
  const MIXED: CompensationItemEntry[] = [
    item({ payeeId: 'w1', whtCondition: 'withhold', grossSatang: 1_000_000, whtSatang: 30_000, netSatang: 970_000 }),
    item({ payeeId: 'w2', whtCondition: 'pay_always', grossSatang: 1_030_928, whtSatang: 30_928, netSatang: 1_000_000 }),
    item({ payeeId: 'w3', whtCondition: 'pay_once', grossSatang: 1_030_000, whtSatang: 30_000, netSatang: 1_000_000 }),
    // ค่าที่พักตามใบเสร็จของผู้รับ (2) — นอกฐาน ไม่มีภาษี
    item({ payeeId: 'w2', caseId: null, expenseType: 'hotel', receiptExpense: true, whtCondition: 'pay_always', grossSatang: 50_000, whtSatang: 0, netSatang: 50_000 }),
  ]

  it('รายพนักงาน: (2) ค่าตอบแทน 10,000 · ภาษีที่บริษัทออกให้ 309.28 · WHT หักผู้รับ 0 · Net 10,000 — (1) ไม่เปลี่ยน', () => {
    const data = buildCompensationReport({ groupBy: 'employee', items: MIXED })
    expect(data.columns.map((column) => column.header)).toContain('ภาษีที่บริษัทออกให้')
    const row = (key: string) => data.rows.find((entry) => entry[ROW_KEY] === key)
    expect(row('w1')).toMatchObject({ commissionSatang: 1_000_000, whtPaidByPayerSatang: 0, whtSatang: 30_000, netSatang: 970_000 })
    expect(row('w2')).toMatchObject({
      commissionSatang: 1_000_000,
      whtPaidByPayerSatang: 30_928,
      receiptSatang: 50_000,
      grossSatang: 1_080_928,
      whtSatang: 0,
      netSatang: 1_050_000,
    })
    expect(row('w3')).toMatchObject({ commissionSatang: 1_000_000, whtPaidByPayerSatang: 30_000, whtSatang: 0, netSatang: 1_000_000 })
  })

  it('รายทีม + KPI: Gross = ค่าตอบแทน + ภาษีที่บริษัทออกให้ + ค่าใช้จ่ายตามใบเสร็จ · Net = Gross − ภาษีออกให้ − WHT', () => {
    const data = buildCompensationReport({ groupBy: 'team', items: MIXED })
    const total = data.totalRow
    expect(total).toMatchObject({
      compensationSatang: 3_000_000,
      whtPaidByPayerSatang: 60_928,
      receiptSatang: 50_000,
      grossSatang: 3_110_928,
      whtSatang: 30_000,
      netSatang: 3_020_000,
    })
    expect(
      Number(total?.['compensationSatang']) + Number(total?.['whtPaidByPayerSatang']) + Number(total?.['receiptSatang']),
    ).toBe(Number(total?.['grossSatang']))
    expect(Number(total?.['grossSatang']) - Number(total?.['whtPaidByPayerSatang']) - Number(total?.['whtSatang'])).toBe(
      Number(total?.['netSatang']),
    )
    const kpi = (key: string) => data.kpis?.find((entry) => entry.key === key)?.value
    expect(kpi('compensation')).toBe(3_000_000)
    expect(kpi('whtPaidByPayer')).toBe(60_928)
    expect(kpi('wht')).toBe(30_000)
    expect(kpi('net')).toBe(3_020_000)
  })

  it('รายการเก่าที่ไม่มีเงื่อนไข (null) = หักตามปกติ', () => {
    const data = buildCompensationReport({
      groupBy: 'team',
      items: [item({ payeeId: 'old', whtCondition: null, grossSatang: 100_000, whtSatang: 3_000, netSatang: 97_000 })],
    })
    expect(data.totalRow).toMatchObject({ compensationSatang: 100_000, whtPaidByPayerSatang: 0, whtSatang: 3_000 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildCompensationReport,
  type CompensationItemEntry,
} from '@/lib/reports/finance/compensation-report'
import { ROW_KEY } from '@/lib/reports/payload'

/** F4 (`96` §6-F4) — สรุปค่าตอบแทนจาก snapshot ของรายการในรอบจ่าย (`92` §7.1) */

function item(overrides: Partial<CompensationItemEntry> & { payeeId: string }): CompensationItemEntry {
  return {
    payeeName: `พนักงาน ${overrides.payeeId}`,
    teamId: 't1',
    teamName: 'ทีมเหนือ',
    teamSide: 'inhouse',
    expenseType: 'commission',
    caseId: 'case-1',
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
      'Gross รวม',
      'WHT รวม',
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

    expect(kpi('gross')).toBe(590_000)
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

    const outsourced = data.rows.find((row) => row[ROW_KEY] === 'p3')
    expect(outsourced).toMatchObject({ otherSatang: 40_000, grossSatang: 40_000 })
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

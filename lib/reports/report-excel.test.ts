import { describe, expect, it } from 'vitest'
import { read, utils, type CellObject } from 'xlsx'
import { buildReportWorkbook } from '@/lib/reports/report-excel'
import type { ReportPayload } from '@/lib/reports/payload'

/**
 * UAT BUG-134 — ไฟล์ Excel รายงานต้องมีรูปแบบตัวเลข: เงิน `#,##0.00` (satang/100) · % 2 ทศนิยม ·
 * วัน 1 ทศนิยม · อัตราส่วนที่คำนวณไม่ได้เป็นข้อความ "N/A" (ไม่ใช่ช่องว่าง)
 */

const PAYLOAD: ReportPayload = {
  report: { code: 'F1', id: 'gross-profit', title: 'กำไรขั้นต้น', category: 'F' },
  range: { preset: 'this_month', label: 'ตุลาคม 2569', from: '2026-10-01', to: '2026-10-31' },
  columns: [
    { key: 'company', header: 'บริษัท', type: 'text' },
    { key: 'revenue', header: 'รายได้', type: 'money' },
    { key: 'cases', header: 'เคส', type: 'number' },
    { key: 'tat', header: 'TAT (วัน)', type: 'days' },
    { key: 'margin', header: 'Margin', type: 'percent' },
  ],
  rows: [
    { company: 'ก', revenue: 363_000, cases: 3, tat: 0.4, margin: 44.214876033057855 },
    { company: 'ข', revenue: 0, cases: 0, tat: null, margin: null },
  ],
  kpis: [],
  totalRow: null,
  note: null,
  cache: {
    mode: 'realtime',
    computedAt: '2026-10-04T03:00:00Z',
    fromCache: false,
    stale: false,
    expiresAt: null,
    refreshAvailableAt: null,
    refreshThrottled: false,
  },
}

function cellsOfRow(rowIndex: number): Array<CellObject | undefined> {
  const workbook = read(buildReportWorkbook(PAYLOAD, new Date('2026-10-04T03:00:00Z')), { cellNF: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
  if (sheet === undefined) throw new Error('ไม่มีชีต')
  return PAYLOAD.columns.map((_column, c) => sheet[utils.encode_cell({ r: rowIndex, c })] as CellObject | undefined)
}

// หัวชีต 5 บรรทัด (รวมบรรทัดว่าง) + หัวคอลัมน์ 1 ⇒ ข้อมูลแถวแรกอยู่ index 6
const FIRST_DATA_ROW = 6

describe('buildReportWorkbook — รูปแบบตัวเลข (BUG-134)', () => {
  it('เงิน 2 ทศนิยมจากบาท · จำนวนนับไม่มีทศนิยม · วัน 1 ทศนิยม · % 2 ทศนิยม — ค่ายังเป็นตัวเลข', () => {
    const [company, revenue, cases, tat, margin] = cellsOfRow(FIRST_DATA_ROW)
    expect(company?.z ?? 'General').toBe('General')
    expect(revenue).toMatchObject({ t: 'n', v: 3630, z: '#,##0.00' })
    expect(cases).toMatchObject({ t: 'n', v: 3, z: '#,##0' })
    expect(tat).toMatchObject({ t: 'n', v: 0.4, z: '#,##0.0' })
    expect(margin).toMatchObject({ t: 'n', z: '0.00"%"' })
    expect(margin?.v).toBeCloseTo(44.2149, 3)
  })

  it('margin ที่คำนวณไม่ได้เป็นข้อความ "N/A" · วันที่ไม่มีค่าเป็นช่องว่าง', () => {
    const [, , , tat, margin] = cellsOfRow(FIRST_DATA_ROW + 1)
    expect(margin).toMatchObject({ t: 's', v: 'N/A' })
    expect(tat?.v ?? '').toBe('')
  })
})

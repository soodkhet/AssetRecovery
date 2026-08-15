import { describe, expect, it } from 'vitest'
import {
  REPORT_EXPORT_SYNC_ROW_LIMIT,
  reportExportFileName,
  reportSheetHeaderBlock,
  reportSheetName,
  reportSheetRows,
  reportTextRows,
  shouldRunExportInBackground,
} from '@/lib/reports/export'
import { formatCellForSheet, formatCellText, type ReportPayload } from '@/lib/reports/payload'

const PAYLOAD: ReportPayload = {
  report: { code: 'F2', id: 'revenue-summary', title: 'สรุปรายได้', category: 'F' },
  range: { preset: 'this_month', label: 'สิงหาคม 2569', from: '2026-08-01', to: '2026-08-31' },
  columns: [
    { key: 'company', header: 'บริษัทไฟแนนซ์', type: 'text' },
    { key: 'revenue', header: 'รายได้รวม', type: 'money' },
    { key: 'cases', header: 'เคสทั้งหมด', type: 'number' },
    { key: 'successRate', header: '% สำเร็จ', type: 'percent' },
    { key: 'lastDueDate', header: 'ครบกำหนดล่าสุด', type: 'date' },
  ],
  rows: [
    { company: 'ไฟแนนซ์ ก', revenue: 1_234_56, cases: 12, successRate: 75, lastDueDate: '2026-08-20' },
    { company: 'ไฟแนนซ์ ข', revenue: 0, cases: 0, successRate: null, lastDueDate: null },
  ],
  kpis: [],
  totalRow: { company: 'รวม', revenue: 1_234_56, cases: 12, successRate: null, lastDueDate: null },
  note: null,
  cache: {
    mode: 'daily',
    computedAt: '2026-08-15T03:00:00.000Z',
    fromCache: false,
    stale: false,
    expiresAt: null,
    refreshAvailableAt: null,
    refreshThrottled: false,
  },
}

describe('ชื่อไฟล์ export (E13)', () => {
  it('รูปแบบ `{code}_{ชื่อ}_{วันที่ พ.ศ.}_{เวลา}.{ext}` — เวลาไทย + พ.ศ. เสมอ', () => {
    // 15/08/2026 03:00Z = 10:00 ตามเวลาไทย
    const at = new Date('2026-08-15T03:00:00Z')
    expect(reportExportFileName({ code: 'F2', title: 'สรุปรายได้', at, format: 'xlsx' })).toBe(
      'F2_สรุปรายได้_15-08-2569_10-00.xlsx',
    )
    expect(reportExportFileName({ code: 'E1', title: 'KPI ภาพรวม', at, format: 'pdf' })).toBe(
      'E1_KPI-ภาพรวม_15-08-2569_10-00.pdf',
    )
  })

  it('ตัวอักษรที่ระบบไฟล์ไม่รับถูกแทนที่ (ไม่มี `/` หลุดไปตัดเป็นโฟลเดอร์)', () => {
    const name = reportExportFileName({
      code: 'O2',
      title: 'ประสิทธิภาพทีม / SLA',
      at: new Date('2026-08-15T03:00:00Z'),
      format: 'xlsx',
    })
    expect(name).toBe('O2_ประสิทธิภาพทีม-SLA_15-08-2569_10-00.xlsx')
    expect(name.includes('/')).toBe(false)
  })

  it('ปีบนชื่อไฟล์เป็น พ.ศ. ไม่ใช่ ค.ศ.', () => {
    const name = reportExportFileName({
      code: 'F1',
      title: 'กำไร',
      at: new Date('2026-01-01T03:00:00Z'),
      format: 'xlsx',
    })
    expect(name).toContain('2569')
    expect(name).not.toContain('2026')
  })
})

describe('เกณฑ์ทำสด vs งานเบื้องหลัง (E13)', () => {
  it('≤ 5,000 แถวทำสด · เกินไปงานเบื้องหลัง', () => {
    expect(REPORT_EXPORT_SYNC_ROW_LIMIT).toBe(5000)
    expect(shouldRunExportInBackground(0)).toBe(false)
    expect(shouldRunExportInBackground(5000)).toBe(false)
    expect(shouldRunExportInBackground(5001)).toBe(true)
  })
})

describe('เนื้อไฟล์ตรงกับ UI (`96` §13)', () => {
  it('Excel: เงินเป็นตัวเลข **บาท** (SUM ได้) · วันที่เป็นข้อความ พ.ศ. (E13)', () => {
    const rows = reportSheetRows(PAYLOAD)
    expect(rows[0]).toEqual(['ไฟแนนซ์ ก', 1234.56, 12, 75, '20/08/2569'])
    // แถวว่างต้องเป็นค่าว่าง ไม่ใช่ 0 (0 ทำให้ผู้อ่านเข้าใจว่ามีข้อมูลจริง)
    expect(rows[1]).toEqual(['ไฟแนนซ์ ข', 0, 0, '', ''])
  })

  it('Excel: แถวรวมท้ายตารางถูกต่อท้ายเป็นแถวสุดท้ายเสมอ', () => {
    const rows = reportSheetRows(PAYLOAD)
    expect(rows).toHaveLength(3)
    expect(rows[2]?.[0]).toBe('รวม')
  })

  it('หัวชีตบอกรายงาน/ช่วงเวลา/เวลาที่คำนวณ (เปิดไฟล์แล้วรู้ทันที)', () => {
    const header = reportSheetHeaderBlock(PAYLOAD, new Date('2026-08-15T03:00:00Z'))
    expect(header[0]).toEqual(['F2 — สรุปรายได้'])
    expect(header[1]).toEqual(['ช่วงเวลา', 'สิงหาคม 2569'])
    expect(header[2]?.[1]).toBe('15/08/2569 10:00')
    expect(reportSheetName(PAYLOAD)).toBe('F2-สรุปรายได้')
  })

  it('PDF: ทุกช่องเป็นข้อความที่ผู้ใช้อ่านได้ · ค่าว่างเป็น "—"', () => {
    const rows = reportTextRows(PAYLOAD)
    expect(rows[0]).toEqual(['ไฟแนนซ์ ก', '1,234.56', '12', '75.00%', '20/08/2569'])
    // อัตราส่วนที่คำนวณไม่ได้แสดง "N/A" ตาม Rule 01 (คนละความหมายกับช่องที่ไม่มีข้อมูล = "—")
    expect(rows[1]).toEqual(['ไฟแนนซ์ ข', '0.00', '0', 'N/A', '—'])
  })

  it('จำนวนช่องต่อแถวเท่ากับจำนวนคอลัมน์เสมอ (คอลัมน์ที่แถวนั้นไม่มีค่า = ว่าง ไม่ใช่เลื่อนตำแหน่ง)', () => {
    const sparse: ReportPayload = { ...PAYLOAD, rows: [{ company: 'มีแค่ชื่อ' }], totalRow: null }
    expect(reportSheetRows(sparse)[0]).toEqual(['มีแค่ชื่อ', '', '', '', ''])
    expect(reportTextRows(sparse)[0]).toEqual(['มีแค่ชื่อ', '—', '—', 'N/A', '—'])
  })
})

describe('การจัดรูปค่าในเซลล์ (Rule 01)', () => {
  it('เงินหารร้อยจากสตางค์เสมอ — ไม่ปัดเศษหาย', () => {
    expect(formatCellForSheet(1, 'money')).toBe(0.01)
    expect(formatCellForSheet(-250_75, 'money')).toBe(-250.75)
    expect(formatCellText(-250_75, 'money')).toBe('-250.75')
  })

  it('วันที่/เวลาบนไฟล์เป็น พ.ศ. ทุกทาง (ห้าม ค.ศ. หลุด)', () => {
    expect(formatCellForSheet('2026-08-20', 'date')).toBe('20/08/2569')
    expect(formatCellText('2026-08-20T10:30:00Z', 'datetime')).toBe('20/08/2569 17:30')
  })
})

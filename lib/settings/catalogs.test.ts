import { describe, expect, it } from 'vitest'
import { EXPORT_FORMATS, INTERNAL_DOCUMENT_TEMPLATES } from '@/lib/settings/catalogs'

/** `13` §6.7 (5 เอกสารภายใน) · §6.9 (Export Pack 00–16 ห้ามขาดไฟล์ — 09 = มติ PO U21 · 10/11 = U40/U41 · 12/13 = U57/U68 · 14 = U87 · 00/15/16 = U94) */

describe('INTERNAL_DOCUMENT_TEMPLATES', () => {
  it('ครบ 5 รายการตาม `13` §6.7', () => {
    expect(INTERNAL_DOCUMENT_TEMPLATES).toHaveLength(5)
  })

  it('code ไม่ซ้ำ', () => {
    const codes = INTERNAL_DOCUMENT_TEMPLATES.map((template) => template.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('ทุกรายการชี้ไฟล์ spec ที่กำหนดรูปแบบ PDF จริง (ไฟล์ 28)', () => {
    expect(INTERNAL_DOCUMENT_TEMPLATES.every((template) => template.sourceFile === '28')).toBe(true)
  })
})

describe('EXPORT_FORMATS', () => {
  it('ครบ 17 ไฟล์ตาม `13` §6.9 / `37` §6.1', () => {
    expect(EXPORT_FORMATS).toHaveLength(18)
  })

  it('เลขนำหน้าไฟล์ต่อเนื่อง 00–17 ไม่ขาด', () => {
    expect(EXPORT_FORMATS.map((spec) => spec.fileName.slice(0, 2))).toEqual([
      '00',
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
    ])
  })

  it('ทุกไฟล์เป็น CSV UTF-8 ยกเว้นไฟล์ 08 เป็น XLSX', () => {
    expect(EXPORT_FORMATS.filter((spec) => spec.format === 'XLSX').map((spec) => spec.fileName)).toEqual([
      '08_Document_Checklist.xlsx',
    ])
    expect(EXPORT_FORMATS[0]).toMatchObject({ format: 'CSV UTF-8', fileName: '00_Control_Totals.csv' })
    expect(EXPORT_FORMATS[15]).toMatchObject({ format: 'CSV UTF-8', fileName: '15_Accrued_Expenses.csv' })
    expect(EXPORT_FORMATS[16]).toMatchObject({ format: 'CSV UTF-8', fileName: '16_Advance_Balance.csv' })
    expect(EXPORT_FORMATS[17]).toMatchObject({ format: 'CSV UTF-8', fileName: '17_Company_Documents.csv' })
  })

  it('รายชื่อไฟล์ตรงกับชุดที่ Export Pack สร้างจริง', async () => {
    const { PACK_FILES } = await import('@/lib/exports/pack')
    expect(EXPORT_FORMATS.map((spec) => spec.fileName)).toEqual(PACK_FILES.map((file) => file.fileName))
  })

  it('นามสกุลไฟล์ตรงกับ format ที่ประกาศ', () => {
    for (const spec of EXPORT_FORMATS) {
      expect(spec.fileName.endsWith(spec.format === 'XLSX' ? '.xlsx' : '.csv')).toBe(true)
    }
  })
})

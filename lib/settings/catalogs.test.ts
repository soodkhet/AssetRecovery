import { describe, expect, it } from 'vitest'
import { EXPORT_FORMATS, INTERNAL_DOCUMENT_TEMPLATES } from '@/lib/settings/catalogs'

/** `13` §6.7 (5 เอกสารภายใน) · §6.9 (Export Pack 01–09 ห้ามขาดไฟล์ — 09 = มติ PO U21) */

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
  it('ครบ 9 ไฟล์ตาม `13` §6.9 / `37` §6.1', () => {
    expect(EXPORT_FORMATS).toHaveLength(9)
  })

  it('เลขนำหน้าไฟล์ต่อเนื่อง 01–09 ไม่ขาด', () => {
    expect(EXPORT_FORMATS.map((spec) => spec.fileName.slice(0, 2))).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
    ])
  })

  it('ไฟล์ 01–07 และ 09 เป็น CSV UTF-8 · ไฟล์ 08 เป็น XLSX', () => {
    expect(EXPORT_FORMATS.slice(0, 7).every((spec) => spec.format === 'CSV UTF-8')).toBe(true)
    expect(EXPORT_FORMATS[7]).toMatchObject({ format: 'XLSX', fileName: '08_Document_Checklist.xlsx' })
    expect(EXPORT_FORMATS[8]).toMatchObject({ format: 'CSV UTF-8', fileName: '09_Credit_Notes.csv' })
  })

  it('นามสกุลไฟล์ตรงกับ format ที่ประกาศ', () => {
    for (const spec of EXPORT_FORMATS) {
      expect(spec.fileName.endsWith(spec.format === 'XLSX' ? '.xlsx' : '.csv')).toBe(true)
    }
  })
})

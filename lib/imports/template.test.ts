import { describe, expect, it } from 'vitest'
import {
  buildImportTemplateCsv,
  IMPORT_COLUMN_REQUIREMENTS,
  IMPORT_REQUIREMENT_BADGE_GROUP,
  IMPORT_REQUIREMENT_LABEL,
  sortTemplateColumns,
  templateColumnDocs,
  type ImportTemplateColumn,
} from '@/lib/imports/template'

const columns: ImportTemplateColumn[] = [
  { header: 'หมายเหตุ', requirement: 'optional', format: 'ข้อความ', examples: ['มี, ลูกน้ำ', ''] },
  { header: 'วันที่', requirement: 'required', format: 'วว/ดด/ปปปป', examples: ['01/10/2569', '02/10/2569'] },
  { header: 'ยอด', requirement: 'conditional', format: 'บาท', examples: ['100.00'] },
]

describe('แม่แบบนำเข้า (โค้ดกลาง)', () => {
  it('เรียง บังคับ → ตามเงื่อนไข → ไม่บังคับ และคงลำดับภายในกลุ่ม', () => {
    expect(sortTemplateColumns(columns).map((column) => column.header)).toEqual(['วันที่', 'ยอด', 'หมายเหตุ'])
  })

  it('CSV = BOM + CRLF ทุกบรรทัด · แถวตัวอย่างเท่าตัวอย่างที่ยาวที่สุด · ค่าที่มีลูกน้ำถูกครอบ "', () => {
    const csv = buildImportTemplateCsv(columns)
    expect(csv).toBe('﻿หมายเหตุ,วันที่,ยอด\r\n"มี, ลูกน้ำ",01/10/2569,100.00\r\n,02/10/2569,\r\n')
  })

  it('ทุกระดับมีป้ายภาษาไทยและกลุ่มสี · docs ไม่พาค่าตัวอย่างไปด้วย', () => {
    for (const requirement of IMPORT_COLUMN_REQUIREMENTS) {
      expect(IMPORT_REQUIREMENT_LABEL[requirement]).toMatch(/[ก-๙]/)
      expect(IMPORT_REQUIREMENT_BADGE_GROUP[requirement]).toBeTruthy()
    }
    expect(templateColumnDocs(columns)[0]).toEqual({ header: 'หมายเหตุ', requirement: 'optional', format: 'ข้อความ' })
  })
})

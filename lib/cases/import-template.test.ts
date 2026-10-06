import { describe, expect, it } from 'vitest'
import { missingRequiredFields } from '@/lib/cases/case'
import {
  buildCaseImportTemplate,
  CASE_IMPORT_TEMPLATE_COLUMNS,
  CASE_IMPORT_TEMPLATE_DOCS,
  IMPORT_COLUMNS,
  parseCsv,
  planImport,
  resolveImportField,
  unmappedHeaders,
} from '@/lib/cases/import'
import { autoMapping, missingRequiredFields as missingMappedFields } from '@/lib/cases/import-wizard'
import { IMPORT_COLUMN_REQUIREMENTS } from '@/lib/imports/template'

/**
 * ไฟล์ตัวอย่างนำเข้าเคส (มติ PO 04/10/2569 — UAT แม่แบบนำเข้าภาษาไทย)
 * กันแม่แบบกับ parser เพี้ยนกันในอนาคต: แม่แบบที่สร้าง → parser/validation ต้องผ่าน 100%
 */

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

describe('ไฟล์ตัวอย่างนำเข้าเคส', () => {
  it('ครอบคลุมทุกคอลัมน์ของ parser · หัวคอลัมน์ไม่ซ้ำ · ทุกหัว resolve กลับเป็นฟิลด์ของตัวเอง', () => {
    expect(CASE_IMPORT_TEMPLATE_COLUMNS).toHaveLength(IMPORT_COLUMNS.length)
    const headers = CASE_IMPORT_TEMPLATE_COLUMNS.map((column) => column.header)
    expect(new Set(headers).size).toBe(headers.length)
    for (const column of IMPORT_COLUMNS) {
      expect(headers).toContain(column.label)
      expect(resolveImportField(column.label)).toBe(column.field)
    }
    expect(unmappedHeaders(headers)).toEqual([])
  })

  it('wizard จับคู่หัวคอลัมน์ของแม่แบบได้อัตโนมัติครบทุกช่อง', () => {
    const mapping = autoMapping(CASE_IMPORT_TEMPLATE_COLUMNS.map((column) => column.header))
    expect(Object.values(mapping).filter((field) => field === '')).toEqual([])
    expect(missingMappedFields(mapping)).toEqual([])
  })

  it('หัวคอลัมน์เป็นภาษาไทย (ยกเว้นชื่อเฉพาะ) และคอลัมน์บังคับมาก่อน', () => {
    const latinOnly = CASE_IMPORT_TEMPLATE_COLUMNS.filter((column) => !/[ก-๙]/.test(column.header)).map(
      (column) => column.header,
    )
    expect(latinOnly.sort()).toEqual(['Facebook', 'IMEI / Serial', 'Line ID'])
    expect(CASE_IMPORT_TEMPLATE_COLUMNS[0]?.header).toBe('เลขที่สัญญา')
    const ranks = CASE_IMPORT_TEMPLATE_COLUMNS.map((column) => IMPORT_COLUMN_REQUIREMENTS.indexOf(column.requirement))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('ไฟล์ที่สร้าง = UTF-8 BOM + CRLF และผ่าน parseCsv → planImport ครบ 100% (ไม่มีแถวผิด)', () => {
    const csv = buildCaseImportTemplate()
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(2)
    const plan = planImport(rows, COMPANY_ID)
    expect(plan.errors).toEqual([])
    expect(plan.rows).toHaveLength(2)
  })

  it('แถวตัวอย่างครบพอส่งตรวจได้ทันที (ไทย + ต่างชาติ) · IMEI 15 หลัก · มูลหนี้บาท → สตางค์', () => {
    const plan = planImport(parseCsv(buildCaseImportTemplate()), COMPANY_ID)
    for (const { input } of plan.rows) {
      const missing = missingRequiredFields({
        caseRef: input.caseRef,
        companyId: input.financeCompanyId,
        debtorName: input.debtorName,
        nationality: input.debtorNationality,
        nationalityOther: input.debtorNationalityOther,
        nationalId: input.debtorNationalId,
        passportNo: input.debtorPassportNo,
        phoneMobile: input.debtorPhoneMobile,
        addrProvince: input.addressCurrent?.province,
        addrDetail: input.addressCurrent?.detail,
        idCardAddrProvince: input.addressIdCard?.province,
        idCardAddrDetail: input.addressIdCard?.detail,
        assetKind: input.assetType,
        assetBrandModel: input.assetBrandModel,
        assetImeiSerial: input.assetImeiSerial,
        assetCapacity: input.assetCapacity,
        assetColor: input.assetColor,
        debtAmountSatang: input.outstandingDebtSatang,
      })
      expect(missing).toEqual([])
      expect(input.assetImeiSerial).toMatch(/^\d{15}$/)
    }
    expect(plan.rows.map((row) => row.input.debtorNationality)).toEqual(['TH', 'MM'])
    expect(plan.rows.map((row) => row.input.outstandingDebtSatang)).toEqual([1_500_000, 850_050])
  })

  it('คำอธิบายคอลัมน์ไม่มีเลขอ้างอิงสเปค', () => {
    for (const doc of CASE_IMPORT_TEMPLATE_DOCS) {
      expect(`${doc.header} ${doc.format}`).not.toMatch(/§|ไฟล์ \d|`\d\d`/)
    }
  })
})

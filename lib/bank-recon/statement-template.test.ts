import { describe, expect, it } from 'vitest'
import {
  buildStatementImportTemplate,
  DEFAULT_STATEMENT_TEMPLATE_COLUMNS,
  parseStatementCsv,
  statementHeaderColumn,
  STATEMENT_IMPORT_TEMPLATE_FILE_NAME,
  SUPPORTED_STATEMENT_COLUMNS,
} from '@/lib/bank-recon/statement'

/**
 * ไฟล์ตัวอย่าง statement (มติ PO 04/10/2569 — UAT แม่แบบนำเข้าภาษาไทย)
 * แม่แบบที่สร้าง → `parseStatementCsv()` ต้องอ่านได้ครบทุกแถว ไม่ว่าบัญชีจะตั้งรูปแบบไว้หรือไม่
 */

describe('ไฟล์ตัวอย่าง statement', () => {
  it('ไม่ได้ตั้งรูปแบบ ⇒ รูปแบบมาตรฐาน หัวคอลัมน์ภาษาไทย · parser อ่านจากหัวตารางได้ 2 แถว ไม่มีแถวผิด', () => {
    const template = buildStatementImportTemplate(null)
    expect(template.usedConfiguredMapping).toBe(false)
    expect(template.fileName).toBe(STATEMENT_IMPORT_TEMPLATE_FILE_NAME)
    expect(template.columns.map((column) => column.header)).toEqual([
      'วันที่',
      'รายละเอียด',
      'เลขที่อ้างอิง',
      'เงินเข้า',
      'เงินออก',
    ])
    expect(template.csv.startsWith('﻿')).toBe(true)

    const parsed = parseStatementCsv({ csv: template.csv, columnMapping: null })
    expect(parsed.errors).toEqual([])
    expect(parsed.columns).toEqual(DEFAULT_STATEMENT_TEMPLATE_COLUMNS)
    expect(parsed.rows.map((row) => row.amountSatang)).toEqual([1_808_942, -824_500])
    // วันที่ตัวอย่างเป็น พ.ศ. 2569 ⇒ ค.ศ. 2026
    expect(parsed.rows[0]?.transactionDate.toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('หัวคอลัมน์ภาษาไทยของทุกคอลัมน์มาตรฐาน resolve กลับเป็นคอลัมน์ของตัวเอง', () => {
    const all = buildStatementImportTemplate(SUPPORTED_STATEMENT_COLUMNS.join(','))
    expect(all.usedConfiguredMapping).toBe(true)
    all.columns.forEach((column, index) => {
      expect(column.header).toMatch(/[ก-๙]/)
      expect(statementHeaderColumn(column.header)).toBe(SUPPORTED_STATEMENT_COLUMNS[index])
    })
  })

  it.each([
    'transaction_date,amount',
    'transaction_date,description,amount,balance',
    'description,reference,transaction_date,amount_out,amount_in,balance',
    SUPPORTED_STATEMENT_COLUMNS.join(','),
  ])('ตั้งรูปแบบ "%s" ⇒ แม่แบบเรียงตามนั้นเป๊ะ และ parser (อ่านตามตำแหน่ง) ผ่านครบ', (mapping) => {
    const template = buildStatementImportTemplate(mapping)
    expect(template.usedConfiguredMapping).toBe(true)
    expect(template.columns.map((column) => statementHeaderColumn(column.header))).toEqual(mapping.split(','))

    const parsed = parseStatementCsv({ csv: template.csv, columnMapping: mapping })
    expect(parsed.usedConfiguredMapping).toBe(true)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows.map((row) => Math.sign(row.amountSatang))).toEqual([1, -1])
  })

  it('ระดับความจำเป็น: วันที่บังคับ · ช่องยอดช่องเดียว = บังคับ · หลายช่อง = ตามเงื่อนไข', () => {
    const single = buildStatementImportTemplate('transaction_date,description,amount')
    expect(single.columns.map((column) => column.requirement)).toEqual(['required', 'optional', 'required'])
    const split = buildStatementImportTemplate(null)
    expect(split.columns.map((column) => column.requirement)).toEqual([
      'required',
      'optional',
      'optional',
      'conditional',
      'conditional',
    ])
  })

  it('mapping ที่ใช้ไม่ได้ (เช่นของไฟล์โอนเงิน) ⇒ กลับไปใช้แม่แบบมาตรฐาน', () => {
    const template = buildStatementImportTemplate('receiving_bank_code,account_no,amount')
    expect(template.usedConfiguredMapping).toBe(false)
    expect(template.columns).toHaveLength(DEFAULT_STATEMENT_TEMPLATE_COLUMNS.length)
  })
})

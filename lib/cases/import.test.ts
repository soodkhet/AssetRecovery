import { describe, expect, it } from 'vitest'
import { normalizeCaseRef } from '@/lib/cases/case-ref'
import {
  findDuplicateRefsInFile,
  importRowIdentityError,
  mapImportRow,
  normalizeImportNationalId,
  normalizeImportPhone,
  parseCsv,
  planImport,
  resolveImportField,
  unmappedHeaders,
} from '@/lib/cases/import'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

describe('parseCsv', () => {
  it('อ่านหัวคอลัมน์บรรทัดแรก + รองรับ BOM/CRLF', () => {
    const rows = parseCsv('﻿เลขที่สัญญา,ชื่อลูกหนี้\r\nSF-001,สมชาย\r\nSF-002,สมหญิง\r\n')
    expect(rows).toEqual([
      { เลขที่สัญญา: 'SF-001', ชื่อลูกหนี้: 'สมชาย' },
      { เลขที่สัญญา: 'SF-002', ชื่อลูกหนี้: 'สมหญิง' },
    ])
  })

  it('รองรับค่าที่มี comma/quote ภายใน', () => {
    const rows = parseCsv('เลขที่สัญญา,ที่อยู่ปัจจุบัน\nSF-003,"99/1 หมู่ 2, ซอย ""ก"""')
    expect(rows[0]?.['ที่อยู่ปัจจุบัน']).toBe('99/1 หมู่ 2, ซอย "ก"')
  })

  it('ข้ามบรรทัดว่าง', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([{ a: '1', b: '2' }])
  })
})

describe('mapping หัวคอลัมน์ (`38` §12 — field ไม่ตรง mapping)', () => {
  it('รู้จักชื่อไทย/อังกฤษ/snake_case ของคอลัมน์เดียวกัน', () => {
    expect(resolveImportField('เลขที่สัญญา')).toBe('caseRef')
    expect(resolveImportField('case_ref')).toBe('caseRef')
    expect(resolveImportField('Case Ref')).toBe('caseRef')
    expect(resolveImportField('IMEI')).toBe('assetImeiSerial')
  })

  it('คอลัมน์ที่ไม่รู้จักถูกรายงานไว้ แต่ไม่ทำให้แถวผิด', () => {
    expect(resolveImportField('คอลัมน์แปลก')).toBeNull()
    expect(unmappedHeaders(['เลขที่สัญญา', 'คอลัมน์แปลก', ''])).toEqual(['คอลัมน์แปลก'])
  })

  it('แปลงเงินจาก **บาท** ในไฟล์เป็น **สตางค์** (Rule 01)', () => {
    const { payload, errors } = mapImportRow({ 'มูลหนี้คงเหลือ': '10,000.50' }, COMPANY_ID)
    expect(errors).toEqual({})
    expect(payload.outstandingDebtSatang).toBe(1_000_050)
  })

  it('เงินที่ไม่ใช่ตัวเลข = ข้อผิดพลาดของแถวนั้น', () => {
    const { errors } = mapImportRow({ 'มูลหนี้คงเหลือ': 'ไม่ทราบ' }, COMPANY_ID)
    expect(errors.outstandingDebtSatang).toBeDefined()
  })

  it('สัญชาติ/ประเภทสินค้ารับได้ทั้งรหัสและคำไทย', () => {
    const { payload } = mapImportRow({ 'สัญชาติ': 'ไทย', 'ประเภทสินค้า': 'มือถือ' }, COMPANY_ID)
    expect(payload.debtorNationality).toBe('TH')
    expect(payload.assetType).toBe('smartphone')
  })

  it('ค่านอกรายการของสัญชาติ/ประเภทสินค้า = ข้อผิดพลาดของแถวนั้น', () => {
    const { errors } = mapImportRow({ 'สัญชาติ': 'ดาวอังคาร', 'ประเภทสินค้า': 'ตู้เย็น' }, COMPANY_ID)
    expect(errors.debtorNationality).toBeDefined()
    expect(errors.assetType).toBeDefined()
  })

  it('ที่อยู่ที่ไม่มีข้อมูลเลยไม่ถูกส่งเป็นก้อนว่าง', () => {
    const { payload } = mapImportRow({ 'เลขที่สัญญา': 'SF-9' }, COMPANY_ID)
    expect(payload.addressCurrent).toBeUndefined()
    expect(payload.addressWork).toBeUndefined()
  })
})

describe('planImport — validate ต่อแถว', () => {
  it('แถวถูกผ่าน แถวผิดตกเฉพาะแถวนั้น (ไม่ reject ทั้งไฟล์)', () => {
    const plan = planImport(
      [
        { 'เลขที่สัญญา': 'SF-001', 'ชื่อลูกหนี้': 'สมชาย', 'มูลหนี้คงเหลือ': '10000' },
        { 'เลขที่สัญญา': '', 'ชื่อลูกหนี้': 'ไม่มีเลขสัญญา' },
        { 'เลขที่สัญญา': 'SF-002', 'สัญชาติ': 'ดาวอังคาร' },
      ],
      COMPANY_ID,
    )
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]?.input.caseRef).toBe('SF-001')
    expect(plan.errors.map((error) => error.rowNumber)).toEqual([3, 4])
    expect(plan.errors.every((error) => error.code === 'API_VALIDATION_FAILED')).toBe(true)
    // BUG-141 — แถวที่ไม่ผ่านต้องคืนเลขที่สัญญาดิบให้ preview แสดง (ไม่มี = null)
    expect(plan.errors.map((error) => error.caseRef)).toEqual([null, 'SF-002'])
  })

  it('เลขแถวเริ่มที่ 2 (แถวแรกของไฟล์คือหัวคอลัมน์)', () => {
    const plan = planImport([{ 'เลขที่สัญญา': 'SF-001' }], COMPANY_ID)
    expect(plan.rows[0]?.rowNumber).toBe(2)
  })

  it('ทุกแถวที่ผ่านถูกตั้ง source_channel = import (`38` §19)', () => {
    const plan = planImport([{ 'เลขที่สัญญา': 'SF-001' }], COMPANY_ID)
    expect(plan.rows[0]?.input.sourceChannel).toBe('import')
    expect(plan.rows[0]?.input.financeCompanyId).toBe(COMPANY_ID)
  })

  it('แถวที่ข้อมูลไม่ครบยังสร้าง draft ได้ (ความครบถ้วนบังคับตอน pending_review)', () => {
    const plan = planImport([{ 'เลขที่สัญญา': 'SF-777' }], COMPANY_ID)
    expect(plan.rows).toHaveLength(1)
    expect(plan.errors).toEqual([])
  })
})

describe('เลขที่สัญญาซ้ำภายในไฟล์เดียว (`38` §11)', () => {
  it('แถวหลังเป็นฝ่ายผิด — เทียบที่ระดับ normalize (พิมพ์เล็ก/ใหญ่ + ช่องว่าง)', () => {
    const plan = planImport(
      [{ 'เลขที่สัญญา': 'SF-001' }, { 'เลขที่สัญญา': ' sf-001 ' }, { 'เลขที่สัญญา': 'SF-002' }],
      COMPANY_ID,
    )
    expect([...findDuplicateRefsInFile(plan.rows, normalizeCaseRef)]).toEqual([3])
  })

  it('dash/underscore ต่างตำแหน่ง = ไม่ซ้ำ (normalize ไม่ตัดอักขระ)', () => {
    const plan = planImport([{ 'เลขที่สัญญา': 'SF-001' }, { 'เลขที่สัญญา': 'SF_001' }], COMPANY_ID)
    expect(findDuplicateRefsInFile(plan.rows, normalizeCaseRef).size).toBe(0)
  })
})

describe('เบอร์โทร/เลขบัตรในไฟล์นำเข้า — ตรงกับฟอร์มและการนำเข้าจริง (preship R3-006)', () => {
  it('normalizeImportPhone: รูปแบบที่ฟอร์มรับได้ ⇒ ตัวเลขล้วนแบบเดียวกับฟอร์ม', () => {
    expect(normalizeImportPhone('081-234-5678')).toBe('0812345678')
    expect(normalizeImportPhone('+66 81 234 5678')).toBe('0812345678')
    expect(normalizeImportPhone('(081) 234-5678')).toBe('0812345678')
    expect(normalizeImportPhone('081.234.5678')).toBe('0812345678')
    expect(normalizeImportPhone('02-123-4567')).toBe('021234567')
    expect(normalizeImportPhone('0812345678')).toBe('0812345678')
  })

  it('normalizeImportPhone: มีอักขระอื่นปน ⇒ ไม่ตัดทิ้งเงียบ (ปล่อยค่าเดิมให้แถวตก)', () => {
    expect(normalizeImportPhone('abc')).toBe('abc')
    expect(normalizeImportPhone('081-234-5678 ต่อ 12')).toBe('081-234-5678 ต่อ 12')
    expect(normalizeImportPhone('---')).toBe('---')
  })

  it('normalizeImportPhone: เลขไทย/เลขเต็มความกว้าง ⇒ แปลงเป็นเลขอารบิกแบบเดียวกับฟอร์ม', () => {
    expect(normalizeImportPhone('๐๘๑-๒๓๔-๕๖๗๘')).toBe('0812345678')
    expect(normalizeImportPhone('０８１２３４５６７８')).toBe('0812345678')
    expect(normalizeImportPhone('＋๖๖ ๘๑ ๒๓๔ ๕๖๗๘')).toBe('0812345678')
    expect(normalizeImportPhone('๐๘๑ ต่อ ๒')).toBe('๐๘๑ ต่อ ๒')
  })

  it('normalizeImportNationalId: ตัดเฉพาะขีด/ช่องว่าง + แปลงเลขไทย — อักขระอื่นไม่ตัดเงียบ', () => {
    expect(normalizeImportNationalId('1-2345-67890-12-3')).toBe('1234567890123')
    expect(normalizeImportNationalId('1 2345 67890 12 3')).toBe('1234567890123')
    expect(normalizeImportNationalId('๑๒๓๔๕๖๗๘๙๐๑๒๓')).toBe('1234567890123')
    expect(normalizeImportNationalId('1234567890123')).toBe('1234567890123')
    expect(normalizeImportNationalId('1.2345.67890.12.3')).toBe('1.2345.67890.12.3')
    expect(normalizeImportNationalId('A234567890123')).toBe('A234567890123')
    expect(normalizeImportNationalId('---')).toBe('---')
  })

  it('planImport: เลขบัตรมีขีด/เลขไทย ผ่าน · ขาด/เกิน/อักขระอื่น ⇒ CASE_INVALID_NATIONAL_ID', () => {
    const plan = planImport(
      [
        { 'เลขที่สัญญา': 'NID-1', 'เลขบัตรประชาชน': '1-2345-67890-12-3', 'เบอร์มือถือ': '๐๘๑๒๓๔๕๖๗๘' },
        { 'เลขที่สัญญา': 'NID-2', 'เลขบัตรประชาชน': '1-2345-67890-12' },
        { 'เลขที่สัญญา': 'NID-3', 'เลขบัตรประชาชน': '12345678901.3' },
        { 'เลขที่สัญญา': 'NID-4', 'เลขบัตรประชาชน': '1.2345.67890.12.3' },
      ],
      COMPANY_ID,
    )
    // ยาวเกิน 13 ตัวอักษรหลังตัดขีด/ช่องว่าง ⇒ แถวตกตั้งแต่ Zod (ไม่ถูกตัดให้สั้นลงเงียบ)
    expect(plan.errors.map((error) => [error.caseRef, Object.keys(error.fields)])).toEqual([['NID-4', ['debtorNationalId']]])
    expect(plan.rows[0]?.input.debtorNationalId).toBe('1234567890123')
    expect(plan.rows[0]?.input.debtorPhoneMobile).toBe('0812345678')
    expect(plan.rows.map((row) => importRowIdentityError(row.input)?.code ?? null)).toEqual([
      null,
      'CASE_INVALID_NATIONAL_ID',
      'CASE_INVALID_NATIONAL_ID',
    ])
  })

  it('mapImportRow: เบอร์มีขีด/รหัสประเทศ ⇒ payload เป็นเบอร์ 10 หลัก ไม่ติด error', () => {
    const { payload, errors } = mapImportRow(
      { 'เลขที่สัญญา': 'SF-1', 'เบอร์มือถือ': '+66 81 234 5678', 'เบอร์ที่ทำงาน': '(02) 123-4567' },
      COMPANY_ID,
    )
    expect(errors).toEqual({})
    expect(payload.debtorPhoneMobile).toBe('0812345678')
    expect(payload.debtorPhoneWork).toBe('021234567')
  })

  it('mapImportRow: เบอร์ที่ตัดขีดแล้วเหลือ 9 หลักไม่ขึ้นต้น 0 ⇒ ยังจับเรื่องเลข 0 นำหน้าหาย', () => {
    const { errors } = mapImportRow({ 'เลขที่สัญญา': 'SF-1', 'เบอร์มือถือ': '81-234-5678' }, COMPANY_ID)
    expect(errors.debtorPhoneMobile).toMatch(/เลข 0 นำหน้า/)
  })

  it('importRowIdentityError: รหัส error เดียวกับ createCase', () => {
    const plan = planImport(
      [
        { 'เลขที่สัญญา': 'SF-1', 'เบอร์มือถือ': '081-234-5678' },
        { 'เลขที่สัญญา': 'SF-2', 'เบอร์มือถือ': 'abc' },
        { 'เลขที่สัญญา': 'SF-3', 'เบอร์มือถือ': '0812345678999' },
        { 'เลขที่สัญญา': 'SF-4', 'เลขบัตรประชาชน': '12345' },
        { 'เลขที่สัญญา': 'SF-5', 'เบอร์ที่ทำงาน': '02-12' },
      ],
      COMPANY_ID,
    )
    expect(plan.errors).toEqual([])
    expect(plan.rows.map((row) => importRowIdentityError(row.input)?.code ?? null)).toEqual([
      null,
      'CASE_INVALID_PHONE_FORMAT',
      'CASE_INVALID_PHONE_FORMAT',
      'CASE_INVALID_NATIONAL_ID',
      'CASE_INVALID_PHONE_FORMAT',
    ])
  })
})

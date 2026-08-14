import { describe, expect, it } from 'vitest'
import { planImport } from '@/lib/cases/import'
import {
  applyHeaderMapping,
  autoMapping,
  collectHeaders,
  duplicateMappedFields,
  ignoredHeaders,
  missingRequiredFields,
} from '@/lib/cases/import-wizard'

/** `38` §7.1 — wizard: เลือกไฟล์ → mapping คอลัมน์ → preview → ยืนยัน */

const COMPANY_ID = '22222222-2222-4222-8222-222222222222'

const RAW_ROWS = [
  { 'เลขที่สัญญา': 'SF-001', 'ชื่อลูกหนี้': 'สมชาย', 'คอลัมน์แปลก': 'x', 'ยอดค้าง': '1500.50' },
  { 'เลขที่สัญญา': 'SF-002', 'ชื่อลูกหนี้': 'สมหญิง', 'คอลัมน์แปลก': 'y', 'ยอดค้าง': '2000' },
]

describe('collectHeaders', () => {
  it('รวมหัวคอลัมน์จากทุกแถว (ไฟล์ที่บางแถวขาดคอลัมน์)', () => {
    expect(collectHeaders([{ a: 1 }, { b: 2, a: 3 }])).toEqual(['a', 'b'])
  })

  it('ข้ามหัวคอลัมน์ว่าง', () => {
    expect(collectHeaders([{ '': 1, a: 2 }])).toEqual(['a'])
  })
})

describe('autoMapping', () => {
  it('เดาคอลัมน์ที่รู้จักให้ และปล่อยคอลัมน์แปลกเป็น "ไม่นำเข้า"', () => {
    const mapping = autoMapping(collectHeaders(RAW_ROWS))
    expect(mapping['เลขที่สัญญา']).toBe('caseRef')
    expect(mapping['ชื่อลูกหนี้']).toBe('debtorName')
    expect(mapping['คอลัมน์แปลก']).toBe('')
  })

  it('ฟิลด์เดียวกันถูกเดาให้แค่คอลัมน์แรก', () => {
    const mapping = autoMapping(['case_ref', 'เลขที่สัญญา'])
    expect(mapping.case_ref).toBe('caseRef')
    expect(mapping['เลขที่สัญญา']).toBe('')
  })
})

describe('ยามก่อนนำเข้า', () => {
  it('ยังไม่ได้ map เลขที่สัญญา = นำเข้าไม่ได้', () => {
    expect(missingRequiredFields({ a: 'debtorName' })).toEqual(['caseRef'])
    expect(missingRequiredFields({ a: 'caseRef' })).toEqual([])
  })

  it('map ฟิลด์เดียวกัน 2 คอลัมน์ = ต้องแจ้งให้แก้ (ค่าจะทับกัน)', () => {
    expect(duplicateMappedFields({ a: 'caseRef', b: 'caseRef', c: '' })).toEqual(['caseRef'])
    expect(duplicateMappedFields({ a: 'caseRef', b: 'debtorName' })).toEqual([])
  })

  it('บอกคอลัมน์ที่จะไม่ถูกนำเข้า', () => {
    expect(ignoredHeaders({ a: 'caseRef', 'คอลัมน์แปลก': '' })).toEqual(['คอลัมน์แปลก'])
  })
})

describe('applyHeaderMapping', () => {
  it('เปลี่ยนหัวคอลัมน์เป็น label มาตรฐาน และตัดคอลัมน์ที่ไม่ได้ map ทิ้ง', () => {
    const mapping = { ...autoMapping(collectHeaders(RAW_ROWS)), 'ยอดค้าง': 'outstandingDebtBaht' } as const
    const mapped = applyHeaderMapping(RAW_ROWS, mapping)
    expect(mapped[0]).toEqual({
      'เลขที่สัญญา': 'SF-001',
      'ชื่อลูกหนี้': 'สมชาย',
      'มูลหนี้คงเหลือ (บาท)': '1500.50',
    })
    expect(Object.keys(mapped[0] ?? {})).not.toContain('คอลัมน์แปลก')
  })

  it('ผลลัพธ์ผ่าน `planImport()` ของ backend ได้โดยไม่ต้องส่ง mapping ไปด้วย', () => {
    const mapping = { ...autoMapping(collectHeaders(RAW_ROWS)), 'ยอดค้าง': 'outstandingDebtBaht' } as const
    const plan = planImport(applyHeaderMapping(RAW_ROWS, mapping), COMPANY_ID)
    expect(plan.errors).toEqual([])
    expect(plan.rows.map((row) => row.input.caseRef)).toEqual(['SF-001', 'SF-002'])
    // เงินในไฟล์เป็น **บาท** → สตางค์ (Rule 01)
    expect(plan.rows[0]?.input.outstandingDebtSatang).toBe(150_050)
  })

  it('ค่าว่าง/null ไม่ทำให้แถวพัง', () => {
    const mapped = applyHeaderMapping([{ 'เลขที่สัญญา': null }], { 'เลขที่สัญญา': 'caseRef' })
    expect(mapped[0]?.['เลขที่สัญญา']).toBe('')
  })
})

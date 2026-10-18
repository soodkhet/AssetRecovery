import { describe, expect, it } from 'vitest'
import { planImport } from '@/lib/cases/import'
import type { CaseImportResultDto } from '@/lib/cases/types'
import {
  importErrorFieldLabel,
  applyHeaderMapping,
  autoMapping,
  collectHeaders,
  duplicateMappedFields,
  ignoredHeaders,
  importResultToastDescription,
  importableRowCount,
  missingRequiredFields,
  LOST_IMPORT_NOT_FOUND_MESSAGE,
  reconcileLostImport,
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

describe('importErrorFieldLabel — ป้ายไทยของ error ต่อแถว (BUG-141)', () => {
  it('ฟิลด์ที่เป็นคอลัมน์นำเข้าใช้ป้ายของคอลัมน์ ไม่โชว์ชื่อฟิลด์ดิบ', () => {
    expect(importErrorFieldLabel('assetImeiSerial')).toBe('IMEI / Serial')
    expect(importErrorFieldLabel('caseRef')).toBe('เลขที่สัญญา')
    expect(importErrorFieldLabel('addressCurrent.province')).toBe('จังหวัด (ปัจจุบัน)')
  })

  it('key ระดับ object / ฟิลด์ที่ระบบเติมให้ มีป้ายไทย · ไม่รู้จัก = ข้อความกลาง', () => {
    expect(importErrorFieldLabel('addressWork')).toBe('ที่อยู่ที่ทำงาน')
    expect(importErrorFieldLabel('outstandingDebtSatang')).toBe('มูลหนี้คงเหลือ (บาท)')
    expect(importErrorFieldLabel('contacts.0.phone')).toBe('ผู้ติดต่อ')
    expect(importErrorFieldLabel('somethingElse')).toBe('ข้อมูลในแถว')
  })
})

describe('importResultToastDescription — mytester3 B3-01 แถวที่มีคำเตือนต้องบอกใน toast', () => {
  const row = (status: 'created' | 'failed', warned: boolean) =>
    ({ status, warnings: warned ? { assetImeiSerial: 'IMEI ซ้ำ' } : null }) as CaseImportResultDto['rows'][number]

  it('ไม่มีแถวตก ไม่มีคำเตือน = ทุกแถวผ่าน', () => {
    expect(importResultToastDescription({ failedCount: 0, rows: [row('created', false)] })).toBe('ทุกแถวผ่านการตรวจสอบ')
  })

  it('นำเข้าได้แต่มีคำเตือน ⇒ บอกจำนวนแถวที่มีคำเตือน', () => {
    expect(
      importResultToastDescription({ failedCount: 0, rows: [row('created', true), row('created', false)] }),
    ).toBe('มี 1 แถวที่มีคำเตือน — ดูรายละเอียดในตาราง')
  })

  it('มีทั้งแถวตกและคำเตือน ⇒ บอกทั้งสองอย่าง (แถวตกที่มีคำเตือนไม่นับซ้ำ)', () => {
    expect(
      importResultToastDescription({ failedCount: 1, rows: [row('failed', true), row('created', true)] }),
    ).toBe('มี 1 แถวที่นำเข้าไม่ได้ · มี 1 แถวที่มีคำเตือน — ดูรายละเอียดในตาราง')
    expect(importResultToastDescription({ failedCount: 2, rows: [row('failed', false)] })).toBe(
      'มี 2 แถวที่นำเข้าไม่ได้ — ดูรายละเอียดในตาราง',
    )
  })
})

describe('mytester7 S7-AG6-01/02 — ปุ่มยืนยันนำเข้า + กู้ผลเมื่อไม่ได้รับคำตอบ', () => {
  const row = (
    rowNumber: number,
    status: 'created' | 'failed',
    errorCode: string | null = null,
    existingCaseId?: string,
  ): CaseImportResultDto['rows'][number] => ({
    rowNumber,
    caseRef: `SF-${rowNumber}`,
    status,
    caseId: null,
    errorCode,
    errorMessage: errorCode === null ? null : 'x',
    fields: null,
    warnings: null,
    ...(existingCaseId === undefined ? {} : { existingCaseId }),
  })
  const result = (dryRun: boolean, rows: CaseImportResultDto['rows']): CaseImportResultDto => ({
    dryRun,
    totalRows: rows.length,
    createdCount: rows.filter((item) => item.status === 'created').length,
    failedCount: rows.filter((item) => item.status === 'failed').length,
    unmappedHeaders: [],
    rows,
  })

  it('ทุกแถวไม่ผ่าน ⇒ นำเข้าได้ 0 แถว (ปุ่มยืนยันต้องปิด)', () => {
    expect(importableRowCount({ totalRows: 20, failedCount: 20 })).toBe(0)
    expect(importableRowCount({ totalRows: 20, failedCount: 3 })).toBe(17)
  })

  it('ตรวจซ้ำพบเลขที่สัญญาของแถวที่เคยผ่านมีในระบบแล้วครบ ⇒ นำเข้าแล้ว (ผลแบบนำเข้าจริง ชี้เคสในระบบ)', () => {
    const preview = result(true, [row(2, 'created'), row(3, 'created'), row(4, 'failed', 'REQUIRED_MISSING')])
    const recheck = result(true, [
      row(2, 'failed', 'CASE_REF_DUPLICATE', 'case-2'),
      row(3, 'failed', 'CASE_REF_DUPLICATE', 'case-3'),
      row(4, 'failed', 'REQUIRED_MISSING'),
    ])
    const outcome = reconcileLostImport(preview, recheck)
    expect(outcome.importedCount).toBe(2)
    expect(outcome.remainingCount).toBe(0)
    expect(outcome.result.dryRun).toBe(false)
    expect(outcome.result.createdCount).toBe(2)
    expect(outcome.result.failedCount).toBe(1)
    expect(outcome.result.rows.map((item) => [item.status, item.caseId])).toEqual([
      ['created', 'case-2'],
      ['created', 'case-3'],
      ['failed', null],
    ])
  })

  it('ยังไม่มีเคสในระบบ ⇒ ยังไม่ได้นำเข้า (คง preview ให้กดยืนยันใหม่)', () => {
    const preview = result(true, [row(2, 'created')])
    const outcome = reconcileLostImport(preview, preview)
    expect(outcome).toEqual({ importedCount: 0, remainingCount: 1, result: preview })
  })

  it('mytester7 review — ยังไม่พบผล ⇒ ข้อความบอกว่าระบบอาจยังประมวลผลอยู่ ให้รอแล้วตรวจอีกครั้ง (ไม่มีเลขอ้างอิงสเปค)', () => {
    expect(LOST_IMPORT_NOT_FOUND_MESSAGE.message).toContain('ระบบอาจยังประมวลผลอยู่ รอสักครู่แล้วตรวจอีกครั้ง')
    expect(`${LOST_IMPORT_NOT_FOUND_MESSAGE.title}${LOST_IMPORT_NOT_FOUND_MESSAGE.message}`).not.toMatch(/§|S7-/)
  })

  it('นำเข้าไปบางส่วน ⇒ บอกจำนวน + คง preview ล่าสุดให้ยืนยันส่วนที่เหลือ', () => {
    const preview = result(true, [row(2, 'created'), row(3, 'created')])
    const recheck = result(true, [row(2, 'failed', 'CASE_REF_DUPLICATE', 'case-2'), row(3, 'created')])
    const outcome = reconcileLostImport(preview, recheck)
    expect(outcome.importedCount).toBe(1)
    expect(outcome.remainingCount).toBe(1)
    expect(outcome.result).toBe(recheck)
  })
})

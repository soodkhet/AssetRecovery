import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TacFileFormatError,
  tacUpdateStatusView,
  isTacCsvHeader,
  iterateCsvRows,
  normalizeTacCell,
  parseTacCsv,
  parseTacInput,
  parseTacSpecs,
  prettyBrandName,
  prettyModelName,
  splitBrandModelText,
  splitSpecsParts,
  splitTrailingYear,
  tacImportDecision,
  tacLabel,
  tacOfImei,
} from '@/lib/device-catalog/tac'

/** ฐาน TAC — แยกไฟล์ `tac_full.csv` ของ `MoazEb/tac-database` (มติ PO U166 · DEC-017) — fixture เล็กใน repo เท่านั้น */

const SAMPLE = readFileSync(join(__dirname, 'fixtures', 'tac-sample.csv'), 'utf8')

describe('TAC จาก IMEI / ค่าที่ผู้ดูแลพิมพ์', () => {
  it('8 หลักแรกของ IMEI 15 หลักเท่านั้น', () => {
    expect(tacOfImei('359847451234567')).toBe('35984745')
    expect(tacOfImei('35984745123456')).toBeNull()
    expect(tacOfImei(null)).toBeNull()
  })

  it('TAC ที่ผู้ดูแลพิมพ์ — ตัดช่องว่าง/ขีด/จุดได้ ต้องเหลือ 8 หลัก', () => {
    expect(parseTacInput('3598 4745')).toBe('35984745')
    expect(parseTacInput('35-98-47-45')).toBe('35984745')
    expect(parseTacInput('3598474')).toBeNull()
    expect(parseTacInput('3598474A')).toBeNull()
  })

  it('TAC ในไฟล์ที่เลข 0 นำหน้าหาย (6–7 หลัก) เติมให้ครบ 8 หลัก', () => {
    expect(normalizeTacCell('1335900')).toBe('01335900')
    expect(normalizeTacCell('440236')).toBe('00440236')
    expect(normalizeTacCell('')).toBeNull()
    expect(normalizeTacCell('12345')).toBeNull()
  })
})

describe('CSV', () => {
  it('คำพูดครอบ · จุลภาคในคำพูด · "" = " · CRLF · BOM', () => {
    const rows = [...iterateCsvRows('﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n')]
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'he said "hi"'],
    ])
  })

  it('หัวตาราง Brand,TAC,SPECS (ไม่สนตัวพิมพ์)', () => {
    expect(isTacCsvHeader(['Brand', 'TAC', 'SPECS'])).toBe(true)
    expect(isTacCsvHeader(['brand', ' tac ', 'specs'])).toBe(true)
    expect(isTacCsvHeader(['Brand', 'IMEI', 'SPECS'])).toBe(false)
  })

  it('ส่วนของ SPECS แยกด้วยจุลภาคที่ไม่อยู่ในวงเล็บ · ตัด N/A', () => {
    expect(splitSpecsParts('SONY XPERIA 10, Sony I3113, Xperia 10 I3113 (UK, EU, ZA), 2019')).toEqual([
      'SONY XPERIA 10',
      'Sony I3113',
      'Xperia 10 I3113 (UK, EU, ZA)',
      '2019',
    ])
    expect(splitSpecsParts('APPLE IPHONE AIR, N/A, A3518, 2025')).toEqual(['APPLE IPHONE AIR', 'A3518', '2025'])
  })
})

describe('ปีติดท้ายรหัสรุ่น (เคสยาก)', () => {
  it('แยกปีที่ติดท้ายรหัส', () => {
    expect(splitTrailingYear('Samsung SM-A057F/DS2023', 2027)).toEqual({ code: 'Samsung SM-A057F/DS', year: 2023 })
    expect(splitTrailingYear('Xiaomi MEE72018', 2027)).toEqual({ code: 'Xiaomi MEE7', year: 2018 })
    expect(splitTrailingYear('HMD Global TA-16252024', 2027)).toEqual({ code: 'HMD Global TA-1625', year: 2024 })
    expect(splitTrailingYear('Samsung SM-J200GU DS2015', 2027)).toEqual({ code: 'Samsung SM-J200GU DS', year: 2015 })
  })

  it('ไม่ใช่ปี/ปีอนาคตเกินจริง/เหลือรหัสสั้นเกิน = คงเดิม', () => {
    expect(splitTrailingYear('Vivo Mobile vivo 1727', 2027)).toEqual({ code: 'Vivo Mobile vivo 1727', year: null })
    expect(splitTrailingYear('Model X2099', 2027)).toEqual({ code: 'Model X2099', year: null })
    expect(splitTrailingYear('2023', 2027)).toEqual({ code: '2023', year: null })
  })
})

describe('แยกยี่ห้อ/รุ่น/รหัสรุ่นย่อย/ปีจาก SPECS', () => {
  it.each([
    ['SAMSUNG', 'SAMSUNG GALAXY A05S, Samsung SM-A057F/DS2023', { brand: 'Samsung', model: 'Galaxy A05S', variant: 'SM-A057F/DS', releaseYear: 2023 }],
    ['APPLE', 'APPLE IPHONE 14, Apple iPhone 14, A2882, 2022', { brand: 'Apple', model: 'iPhone 14', variant: 'A2882', releaseYear: 2022 }],
    ['XIAOMI', 'XIAOMI 14T PRO, Xiaomi 2407FPN8EG, Global Model, 2024', { brand: 'Xiaomi', model: '14T Pro', variant: '2407FPN8EG', releaseYear: 2024 }],
    // ชื่อในส่วนแรกเป็นรหัส — ชื่อขายอยู่ส่วนที่ 3
    ['OPPO', 'OPPO PMC110, Oppo PMC110, Oppo A6c, 2026', { brand: 'OPPO', model: 'A6c', variant: 'PMC110', releaseYear: 2026 }],
    ['HUAWEI', 'HUAWEI TLR-AL00, Huawei Device Company TLR-AL00, Huawei nova 14, 2025', { brand: 'HUAWEI', model: 'nova 14', variant: 'TLR-AL00', releaseYear: 2025 }],
    ['XIAOMI', 'XIAOMI 25113PN0EG, Xiaomi 25113PN0EG, Xiaomi 17 (Global)?, 2025', { brand: 'Xiaomi', model: '17', variant: '25113PN0EG', releaseYear: 2025 }],
    ['MOTOROLA', 'MOTOROLA LAGOS25, Motorola XT2535-9, Motorola Moto G06, 2025', { brand: 'Motorola', model: 'Moto G06', variant: 'XT2535-9', releaseYear: 2025 }],
    // ส่วนแรกเป็นแค่แบรนด์
    ['APPLE', 'APPLE, APPLE IPAD MINI', { brand: 'Apple', model: 'iPad Mini', variant: null, releaseYear: null }],
    // ส่วนเดียว "แบรนด์ รุ่น"
    ['BlackBerry', 'BlackBerry BlackBerry Curve 8900', { brand: 'BlackBerry', model: 'Curve 8900', variant: null, releaseYear: null }],
    // แบรนด์ย่อยนำหน้าชื่อรุ่น
    ['XIAOMI', 'XIAOMI REDMI 15C, Xiaomi 25078RA3EY2025', { brand: 'Redmi', model: '15C', variant: '25078RA3EY', releaseYear: 2025 }],
    ['POCO', 'XIAOMI POCO F7 ULTRA, Xiaomi 24122RKC7G, Global Model, 2025', { brand: 'POCO', model: 'F7 Ultra', variant: '24122RKC7G', releaseYear: 2025 }],
    ['HUAWEI', 'HUAWEI HONOR 8X, Huawei JSN-TL00', { brand: 'HONOR', model: '8X', variant: 'JSN-TL00', releaseYear: null }],
    // ชื่อมีปีในวงเล็บ + ปีติดรหัส
    ['NOKIA', 'NOKIA 225 4G (2024), HMD Global TA-16252024', { brand: 'Nokia', model: '225 4G (2024)', variant: null, releaseYear: 2024 }],
    ['OPPO', 'OPPO RENO5 F, Oppo CPH22172021', { brand: 'OPPO', model: 'Reno5 F', variant: 'CPH2217', releaseYear: 2021 }],
    ['REDMI', 'REDMI NOTE 13 PRO, Xiaomi 2312DRA50C, Redmi Note 13 Pro 4G, 2024, MT H G99-Ultra', { brand: 'Redmi', model: 'Note 13 Pro', variant: '2312DRA50C', releaseYear: 2024 }],
    ['LENOVO', 'LENOVO, LENOVO TAB P11 2ND GEN', { brand: 'Lenovo', model: 'Tab P11 2nd Gen', variant: null, releaseYear: null }],
  ])('%s · %s', (brand, specs, expected) => {
    expect(parseTacSpecs(brand, specs)).toEqual(expected)
  })

  it('ตัวสะกดแบรนด์/รุ่น', () => {
    expect(prettyBrandName('VIVO')).toBe('vivo')
    expect(prettyBrandName('REALME')).toBe('realme')
    expect(prettyBrandName('SHENZHEN TINNO')).toBe('Shenzhen Tinno')
    expect(prettyModelName('GALAXY S26 ULTRA')).toBe('Galaxy S26 Ultra')
    expect(prettyModelName('IPHONE 15 PRO MAX')).toBe('iPhone 15 Pro Max')
    expect(prettyModelName('XPERIA 1 IV')).toBe('Xperia 1 IV')
    expect(prettyModelName('Galaxy A55')).toBe('Galaxy A55')
  })
})

describe('ไฟล์ทั้งไฟล์ (fixture เล็ก)', () => {
  it('แยกได้ทุกแถวที่ใช้ได้ · ข้ามแถว TAC ว่าง · เติม 0 นำหน้า', () => {
    const parsed = parseTacCsv(SAMPLE)
    expect(parsed.totalRows).toBe(28)
    expect(parsed.skippedRows).toBe(1)
    expect(parsed.records).toHaveLength(27)
    expect(parsed.records.find((row) => row.tac === '01335900')).toMatchObject({ brand: 'Apple', model: 'iPad Mini' })
    expect(parsed.records.find((row) => row.tac === '35984745')).toMatchObject({
      brand: 'Samsung',
      model: 'Galaxy A55 5G',
      variant: 'SM-A556E',
      releaseYear: 2024,
    })
  })

  it('TAC ซ้ำในไฟล์ = ใช้แถวแรก', () => {
    const parsed = parseTacCsv('Brand,TAC,SPECS\nAPPLE,35000005,"APPLE IPHONE 16, N/A, A1, 2024"\nAPPLE,35000005,"APPLE IPHONE 17, N/A, A2, 2025"\n')
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0]?.model).toBe('iPhone 16')
    expect(parsed.skippedRows).toBe(1)
  })

  it('หัวตารางผิด / ไม่มีแถวที่ใช้ได้ = TacFileFormatError', () => {
    expect(() => parseTacCsv('a,b,c\n1,2,3')).toThrow(TacFileFormatError)
    expect(() => parseTacCsv('Brand,TAC,SPECS\nX,,')).toThrow(TacFileFormatError)
    expect(() => parseTacCsv('')).toThrow(TacFileFormatError)
  })
})

describe('ข้อความยี่ห้อ/รุ่นของฟอร์ม/นำเข้า', () => {
  it('label ไม่ซ้ำชื่อแบรนด์', () => {
    expect(tacLabel('Samsung', 'Galaxy A55')).toBe('Samsung Galaxy A55')
    expect(tacLabel('Nokia', 'Nokia 225')).toBe('Nokia 225')
  })

  it('ข้อความที่พิมพ์เอง → ยี่ห้อ + รุ่น (คำเดียว = ไม่จำ)', () => {
    expect(splitBrandModelText('VIVO Y99 5G')).toEqual({ brand: 'vivo', model: 'Y99 5G' })
    expect(splitBrandModelText('iPhone')).toBeNull()
    expect(splitBrandModelText('')).toBeNull()
  })

  it('นำเข้า CSV: ว่าง = เติม · ไม่ตรง = เตือน · ตรง/ไม่พบ TAC = ไม่ทำอะไร', () => {
    const tac = { brandName: 'Samsung', label: 'Samsung Galaxy A55' }
    expect(tacImportDecision('', tac)).toMatchObject({ fill: true })
    expect(tacImportDecision('OPPO A78', tac)).toMatchObject({ fill: false, warning: expect.stringContaining('ไม่ตรงกับ IMEI') })
    expect(tacImportDecision('samsung a55 สีดำ', tac)).toEqual({ fill: false, warning: null })
    expect(tacImportDecision('OPPO A78', null)).toEqual({ fill: false, warning: null })
  })
})

describe('tacUpdateStatusView — ป้ายผลในประวัติ TAC (มติ O77)', () => {
  const zero = { tacsAdded: 0, brandsAdded: 0, modelsAdded: 0 }
  it('สำเร็จแต่ 0/0/0 ⇒ "ไม่มีของใหม่"', () => {
    expect(tacUpdateStatusView({ status: 'success', ...zero })).toEqual({ label: 'ไม่มีของใหม่', group: 'sent' })
  })
  it('สำเร็จและมีของใหม่ ⇒ "สำเร็จ"', () => {
    expect(tacUpdateStatusView({ status: 'success', ...zero, tacsAdded: 3 })).toEqual({ label: 'สำเร็จ', group: 'success' })
    expect(tacUpdateStatusView({ status: 'success', ...zero, modelsAdded: 1 }).label).toBe('สำเร็จ')
  })
  it('not_modified / failed คงเดิม', () => {
    expect(tacUpdateStatusView({ status: 'not_modified', ...zero }).label).toBe('ไม่มีของใหม่')
    expect(tacUpdateStatusView({ status: 'failed', ...zero, tacsAdded: 5 })).toEqual({ label: 'ล้มเหลว', group: 'critical' })
  })
})

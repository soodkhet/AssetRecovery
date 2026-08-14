import { describe, expect, it } from 'vitest'
import {
  EMPTY_AMOUNT_DISPLAY,
  fmtCount,
  fmtPercent,
  fmtRatioPct,
  fmtSatang,
  fmtSatangRounded,
  fmtSatangSymbol,
  MoneyFormatError,
  parseBahtInput,
  toBahtInput,
} from '@/lib/format/money'

/** ยามของ Rule 01 — เงิน = INTEGER satang เท่านั้น · display หาร 100 + comma ห้ามคำนวณเงินที่ชั้นนี้ */

describe('fmtSatang', () => {
  it('฿100.50 = 10050 satang', () => {
    expect(fmtSatang(10050)).toBe('100.50')
  })

  it('ใส่ comma คั่นหลักพันและทศนิยม 2 ตำแหน่งเสมอ', () => {
    expect(fmtSatang(123456789)).toBe('1,234,567.89')
    expect(fmtSatang(100000)).toBe('1,000.00')
    expect(fmtSatang(5)).toBe('0.05')
    expect(fmtSatang(0)).toBe('0.00')
  })

  it('ค่าติดลบคงเครื่องหมายไว้ (เช่น adjustment หักลบ)', () => {
    expect(fmtSatang(-10050)).toBe('-100.50')
    expect(fmtSatang(-5)).toBe('-0.05')
  })

  it('ไม่มีค่า → fallback', () => {
    expect(fmtSatang(null)).toBe(EMPTY_AMOUNT_DISPLAY)
    expect(fmtSatang(undefined)).toBe(EMPTY_AMOUNT_DISPLAY)
    expect(fmtSatang(null, '0.00')).toBe('0.00')
  })

  it('รับ float = โยน error ทันที (ดักบั๊กเงินที่ไม่ใช่ satang)', () => {
    expect(() => fmtSatang(100.5)).toThrow(MoneyFormatError)
    expect(() => fmtSatang(Number.NaN)).toThrow(MoneyFormatError)
    expect(() => fmtSatang(Number.POSITIVE_INFINITY)).toThrow(MoneyFormatError)
  })

  it('ไม่มีปัญหาปัดเศษของ float (10 satang ต้องไม่กลายเป็น 0.09)', () => {
    expect(fmtSatang(1010)).toBe('10.10')
    expect(fmtSatang(70)).toBe('0.70')
    expect(fmtSatang(29999999999)).toBe('299,999,999.99')
  })
})

describe('fmtSatangSymbol / fmtSatangRounded / fmtCount', () => {
  it('เติมสัญลักษณ์บาท', () => {
    expect(fmtSatangSymbol(10050)).toBe('฿100.50')
    expect(fmtSatangSymbol(null)).toBe(EMPTY_AMOUNT_DISPLAY)
  })

  it('ยอดกลมสำหรับ KPI card', () => {
    expect(fmtSatangRounded(123456789)).toBe('1,234,568')
    expect(fmtSatangRounded(0)).toBe('0')
    expect(() => fmtSatangRounded(1.5)).toThrow(MoneyFormatError)
  })

  it('จำนวนนับทั่วไป', () => {
    expect(fmtCount(1234)).toBe('1,234')
    expect(fmtCount(0)).toBe('0')
    expect(fmtCount(null)).toBe(EMPTY_AMOUNT_DISPLAY)
  })
})

describe('fmtPercent — rate_pct / wht_pct (NUMERIC(5,2))', () => {
  it('รับทั้ง number และ string (Prisma Decimal ผ่าน API = string)', () => {
    expect(fmtPercent(7)).toBe('7.00%')
    expect(fmtPercent('7.00')).toBe('7.00%')
    expect(fmtPercent('3.5')).toBe('3.50%')
    expect(fmtPercent(0)).toBe('0.00%')
  })

  it('ค่าที่ใช้ไม่ได้ → fallback', () => {
    expect(fmtPercent(null)).toBe(EMPTY_AMOUNT_DISPLAY)
    expect(fmtPercent('')).toBe(EMPTY_AMOUNT_DISPLAY)
    expect(fmtPercent('abc')).toBe(EMPTY_AMOUNT_DISPLAY)
  })
})

describe('fmtRatioPct — ค่าที่คำนวณมาแล้วจาก pure module ของ `22`', () => {
  it('null = คำนวณไม่ได้ (revenue = 0 ห้ามหารศูนย์) → N/A', () => {
    expect(fmtRatioPct(null)).toBe('N/A')
    expect(fmtRatioPct(undefined)).toBe('N/A')
    expect(fmtRatioPct(Number.NaN)).toBe('N/A')
  })

  it('ค่าปกติแสดงทศนิยม 2 ตำแหน่ง', () => {
    expect(fmtRatioPct(42.5)).toBe('42.50%')
    expect(fmtRatioPct(-3)).toBe('-3.00%')
  })
})

describe('toBahtInput / parseBahtInput (ช่องกรอกเงินในฟอร์ม)', () => {
  it('แปลงสตางค์ → ข้อความบาทสองตำแหน่ง', () => {
    expect(toBahtInput(10_050)).toBe('100.50')
    expect(toBahtInput(0)).toBe('0.00')
    expect(toBahtInput(null)).toBe('')
  })

  it('ค่าที่ไม่ใช่จำนวนเต็มสตางค์โยน MoneyFormatError', () => {
    expect(() => toBahtInput(100.5)).toThrow(MoneyFormatError)
  })

  it('แปลงข้อความบาท → สตางค์จำนวนเต็ม (ปัดที่ทศนิยมที่ 2)', () => {
    expect(parseBahtInput('100.50')).toBe(10_050)
    expect(parseBahtInput('1,234.56')).toBe(123_456)
    expect(parseBahtInput('0.005')).toBe(1)
  })

  it('ช่องว่าง = ไม่กำหนดค่า (null) · ข้อความที่ไม่ใช่ตัวเลข = NaN', () => {
    expect(parseBahtInput('   ')).toBeNull()
    expect(parseBahtInput('abc')).toBeNaN()
  })
})

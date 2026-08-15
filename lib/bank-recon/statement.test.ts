import { describe, expect, it } from 'vitest'
import {
  isUsableStatementMapping,
  parseAmountToSatang,
  parseStatementColumnMapping,
  parseStatementCsv,
  parseStatementDate,
  splitCsvLine,
  StatementParseError,
  statementRowKey,
} from '@/lib/bank-recon/statement'

/** ไฟล์ 35 §3/§15 — นำเข้า statement ตาม format ที่ตั้งไว้ (`13` §6.8) · Rule 01 (satang จำนวนเต็ม) */

describe('parseAmountToSatang', () => {
  it('แปลงบาททศนิยม 2 ตำแหน่งเป็น satang ด้วยเลขจำนวนเต็ม', () => {
    expect(parseAmountToSatang('100.50')).toBe(10050)
    expect(parseAmountToSatang('1,234.56')).toBe(123456)
    expect(parseAmountToSatang('฿ 8,025.00')).toBe(802500)
    expect(parseAmountToSatang('0.10')).toBe(10)
  })

  it('ทศนิยมตำแหน่งเดียว = เติมศูนย์ (ไม่ใช่ 1 สตางค์)', () => {
    expect(parseAmountToSatang('12.5')).toBe(1250)
  })

  it('ยอดที่ float คลาสสิกเคยเพี้ยน ต้องตรงเป๊ะ', () => {
    // 0.1 + 0.2 = 0.30000000000000004 ถ้าใช้ float — ที่นี่ต้องได้ 30 satang เป๊ะ
    expect(parseAmountToSatang('0.30')).toBe(30)
    expect(parseAmountToSatang('1000000.07')).toBe(100000007)
  })

  it('รองรับเครื่องหมายลบและวงเล็บแบบรายงานบัญชี', () => {
    expect(parseAmountToSatang('-1,500.00')).toBe(-150000)
    expect(parseAmountToSatang('(1,500.00)')).toBe(-150000)
  })

  it('อ่านไม่ออก/ทศนิยมเกิน 2 ตำแหน่ง = null (ห้ามปัดให้เอง)', () => {
    expect(parseAmountToSatang('')).toBeNull()
    expect(parseAmountToSatang('—')).toBeNull()
    expect(parseAmountToSatang('ยอดยกมา')).toBeNull()
    expect(parseAmountToSatang('100.505')).toBeNull()
  })
})

describe('parseStatementDate', () => {
  it('รับ DD/MM/YYYY พ.ศ. แล้วแปลงเป็น ค.ศ. (Rule 01)', () => {
    expect(parseStatementDate('15/08/2569')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })

  it('รับ ค.ศ. ทั้งแบบ DD/MM/YYYY และ ISO', () => {
    expect(parseStatementDate('15/08/2026')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
    expect(parseStatementDate('2026-08-15')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
    expect(parseStatementDate('15-08-2569')?.toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })

  it('วันที่ไม่มีจริง/อ่านไม่ออก = null', () => {
    expect(parseStatementDate('31/02/2569')).toBeNull()
    expect(parseStatementDate('ยอดยกมา')).toBeNull()
  })
})

describe('splitCsvLine', () => {
  it('รองรับอัญประกาศครอบและลูกน้ำในข้อความ', () => {
    expect(splitCsvLine('15/08/2569,"โอนเข้า, KBANK",8025.00')).toEqual(['15/08/2569', 'โอนเข้า, KBANK', '8025.00'])
    expect(splitCsvLine('a,"b""c",d')).toEqual(['a', 'b"c', 'd'])
  })
})

describe('parseStatementColumnMapping', () => {
  it('อ่าน mapping ของ statement ที่ตั้งไว้', () => {
    expect(parseStatementColumnMapping('transaction_date, description, reference, amount_in, amount_out')).toEqual([
      'transaction_date',
      'description',
      'reference',
      'amount_in',
      'amount_out',
    ])
  })

  it('mapping ของไฟล์โอนเงิน (ใช้ผิดช่อง) = ไม่ใช่ mapping ของ statement', () => {
    expect(parseStatementColumnMapping('receiving_bank_code,receiving_account_no,amount')).toEqual([])
    expect(parseStatementColumnMapping(null)).toEqual([])
  })

  it('mapping ที่ไม่มีวันที่หรือยอด = ใช้ไม่ได้', () => {
    expect(isUsableStatementMapping(['description', 'reference'])).toBe(false)
    expect(isUsableStatementMapping(['transaction_date', 'amount'])).toBe(true)
  })
})

describe('parseStatementCsv', () => {
  const configured = 'transaction_date,description,reference,amount_in,amount_out'

  it('อ่านตาม column_mapping ที่ตั้งไว้ + ข้ามหัวตารางให้', () => {
    const csv = [
      'วันที่,รายละเอียด,เลขที่อ้างอิง,เงินเข้า,เงินออก',
      '15/08/2569,โอนเข้าจากกรุงไทยลีสซิ่ง,KBANK-TRX-001,"8,025.00",',
      '16/08/2569,จ่ายรอบ PB-2569-08-001,KBANK-TRX-002,,"120,000.00"',
    ].join('\n')

    const result = parseStatementCsv({ csv, columnMapping: configured })

    expect(result.usedConfiguredMapping).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ amountSatang: 802500 })
    expect(result.rows[0]?.description).toBe('โอนเข้าจากกรุงไทยลีสซิ่ง · อ้างอิง KBANK-TRX-001')
    // เงินออกเก็บเป็นค่าติดลบใน `amount_satang` คอลัมน์เดียว (`02` §9)
    expect(result.rows[1]?.amountSatang).toBe(-12000000)
  })

  it('ไม่มี mapping → เดาจากหัวตารางของไฟล์ (ไทย/อังกฤษ)', () => {
    const csv = ['Date,Description,Deposit,Withdrawal', '2026-08-15,Transfer in,8025.00,'].join('\n')
    const result = parseStatementCsv({ csv, columnMapping: null })

    expect(result.usedConfiguredMapping).toBe(false)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.amountSatang).toBe(802500)
  })

  it('คอลัมน์ amount เดียวที่มีเครื่องหมายในตัว', () => {
    const csv = ['วันที่,รายละเอียด,จำนวนเงิน', '15/08/2569,ค่าธรรมเนียมธนาคาร,-35.00'].join('\n')
    const result = parseStatementCsv({ csv })
    expect(result.rows[0]?.amountSatang).toBe(-3500)
  })

  it('แถวที่อ่านไม่ออกถูกรายงานแยก ไม่ทำให้ทั้งไฟล์ล้ม', () => {
    const csv = [
      'วันที่,รายละเอียด,เลขที่อ้างอิง,เงินเข้า,เงินออก',
      'ยอดยกมา,,,,',
      '15/08/2569,โอนเข้า,REF-1,"8,025.00",',
      '16/08/2569,แถวยอดว่าง,REF-2,,',
    ].join('\n')

    const result = parseStatementCsv({ csv, columnMapping: configured })

    expect(result.rows).toHaveLength(1)
    expect(result.errors.map((error) => error.lineNumber)).toEqual([2, 4])
  })

  it('ไฟล์ที่ไม่มีคอลัมน์วันที่/ยอด = โยน StatementParseError', () => {
    expect(() => parseStatementCsv({ csv: 'foo,bar\n1,2' })).toThrow(StatementParseError)
    expect(() => parseStatementCsv({ csv: '   ' })).toThrow(StatementParseError)
  })
})

describe('statementRowKey', () => {
  it('แถวเดียวกันให้คีย์เดียวกันเสมอ (กันนำเข้าซ้ำ — Rule 09)', () => {
    const row = { transactionDate: new Date('2026-08-15T00:00:00Z'), amountSatang: 802500, description: 'โอนเข้า' }
    expect(statementRowKey(row)).toBe(statementRowKey({ ...row, description: ' โอนเข้า ' }))
    expect(statementRowKey(row)).not.toBe(statementRowKey({ ...row, amountSatang: 802501 }))
  })
})

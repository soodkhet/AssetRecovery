import { describe, expect, it } from 'vitest'
import { compareAssetIdentity, identityMatches, isValidImei } from '@/lib/warehouse/imei'

/**
 * `44` §6.5 · §10 — **exact match 15 หลัก** ห้าม fuzzy/trim/ignore dash
 * (T03 ของ §17: ไม่ตรงก็ยังรับเข้าได้ แต่ผลการเทียบต้องเป็น "ไม่ตรง" เสมอ)
 */

const IMEI = '355000000000001'

describe('isValidImei', () => {
  it('ผ่านเฉพาะตัวเลข 15 หลักพอดี', () => {
    expect(isValidImei(IMEI)).toBe(true)
    expect(isValidImei('35500000000000')).toBe(false) // 14 หลัก
    expect(isValidImei('3550000000000012')).toBe(false) // 16 หลัก
    expect(isValidImei('35500000000000A')).toBe(false)
    expect(isValidImei(null)).toBe(false)
  })
})

describe('identityMatches — ห้าม normalize ก่อนเทียบ', () => {
  it('ค่าเท่ากันเป๊ะเท่านั้นถือว่าตรง', () => {
    expect(identityMatches(IMEI, IMEI)).toBe(true)
  })

  it('ต่างกัน 1 หลัก = ไม่ตรง', () => {
    expect(identityMatches(IMEI, '355000000000002')).toBe(false)
  })

  it('เว้นวรรค/ขีดคั่น/ตัวพิมพ์ ไม่ถูกมองข้าม', () => {
    expect(identityMatches(IMEI, ` ${IMEI} `)).toBe(false)
    expect(identityMatches(IMEI, '35500-0000000001')).toBe(false)
    expect(identityMatches('SN-ab12', 'SN-AB12')).toBe(false)
  })

  it('ค่าใดว่าง = ไม่ตรง (ยืนยันไม่ได้ ≠ ตรง)', () => {
    expect(identityMatches(IMEI, null)).toBe(false)
    expect(identityMatches(null, IMEI)).toBe(false)
  })
})

describe('compareAssetIdentity', () => {
  it('สัญญามี IMEI + ตรวจตรง = ตรง', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: IMEI, serialActual: null },
    )
    expect(result).toMatchObject({ matched: true, comparable: true, mismatchedFields: [] })
  })

  it('สัญญามี IMEI + ตรวจไม่ตรง = ไม่ตรง และระบุช่องที่พลาด', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: '355000000000999', serialActual: null },
    )
    expect(result.matched).toBe(false)
    expect(result.mismatchedFields).toEqual(['imei'])
  })

  it('เครื่องไม่มี IMEI (A6) เทียบด้วย serial แทน', () => {
    const contract = { imeiContract: null, serialContract: 'SN-TAB-001' }
    expect(compareAssetIdentity(contract, { imeiActual: null, serialActual: 'SN-TAB-001' }).matched).toBe(true)
    expect(compareAssetIdentity(contract, { imeiActual: null, serialActual: 'SN-TAB-002' }).matched).toBe(false)
  })

  it('เทียบเฉพาะช่องที่สัญญามีค่า — serial ที่ธุรการกรอกเพิ่มไม่ทำให้ผลเพี้ยน', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: IMEI, serialActual: 'SN-ที่ไม่มีในสัญญา' },
    )
    expect(result.matched).toBe(true)
    expect(result.fields).toHaveLength(1)
  })

  it('สัญญามีทั้งสองช่อง ต้องตรงทั้งคู่', () => {
    const contract = { imeiContract: IMEI, serialContract: 'SN-1' }
    expect(compareAssetIdentity(contract, { imeiActual: IMEI, serialActual: 'SN-1' }).matched).toBe(true)
    const partial = compareAssetIdentity(contract, { imeiActual: IMEI, serialActual: 'SN-2' })
    expect(partial.matched).toBe(false)
    expect(partial.mismatchedFields).toEqual(['serial'])
  })

  it('ยังไม่กรอกค่าที่ตรวจจริง = ไม่ตรง (ต้องเตือน ไม่ใช่ผ่านเงียบ)', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: null, serialActual: null },
    )
    expect(result.matched).toBe(false)
    expect(result.comparable).toBe(true)
  })

  it('สัญญาไม่มีทั้ง IMEI และ serial = เทียบไม่ได้ (ข้อมูลเคสผิดปกติ)', () => {
    const result = compareAssetIdentity(
      { imeiContract: null, serialContract: null },
      { imeiActual: IMEI, serialActual: null },
    )
    expect(result).toMatchObject({ matched: false, comparable: false, fields: [] })
  })
})

import { describe, expect, it } from 'vitest'
import {
  buddhistYear,
  EMPTY_DATE_DISPLAY,
  fmtDate,
  fmtDateTime,
  fmtTime,
  fromInputDate,
  nowDate,
  nowDateTime,
  toBangkokParts,
  toDate,
  toInputDate,
} from '@/lib/format/datetime'

/**
 * ยามของกฎ Rule 01 / `03` §6.5 / `04` §16 — **แสดง ค.ศ. บนหน้าจอ = bug**
 * ทุกเคสอ้าง instant UTC ตรง ๆ เพื่อพิสูจน์การแปลงเป็น Asia/Bangkok (+7) พร้อมกัน
 */

describe('fmtDate — DD/MM/YYYY พ.ศ.', () => {
  it('แปลง UTC → Asia/Bangkok และแสดงปี พ.ศ. ตามตัวอย่างใน `03` §6.5', () => {
    expect(fmtDate('2026-07-02T07:30:00Z')).toBe('02/07/2569')
  })

  it('เติมศูนย์หน้าวัน/เดือนเสมอ และใช้ separator `/` เท่านั้น', () => {
    expect(fmtDate('2026-01-05T03:00:00Z')).toBe('05/01/2569')
  })

  it('instant หลัง 17:00 UTC = วันถัดไปตามเวลาไทย (ห้ามแสดงวันตาม UTC)', () => {
    expect(fmtDate('2026-08-13T17:30:00Z')).toBe('14/08/2569')
  })

  it('รับ Date / string / number ได้เหมือนกันหมด', () => {
    const iso = '2026-08-13T17:30:00Z'
    expect(fmtDate(new Date(iso))).toBe(fmtDate(iso))
    expect(fmtDate(new Date(iso).getTime())).toBe(fmtDate(iso))
  })

  it('ค่าว่าง/ไม่ใช่วันที่ → fallback ไม่ใช่ "Invalid Date"', () => {
    expect(fmtDate(null)).toBe(EMPTY_DATE_DISPLAY)
    expect(fmtDate(undefined)).toBe(EMPTY_DATE_DISPLAY)
    expect(fmtDate('')).toBe(EMPTY_DATE_DISPLAY)
    expect(fmtDate('ไม่ใช่วันที่')).toBe(EMPTY_DATE_DISPLAY)
    expect(fmtDate(null, 'ยังไม่ระบุ')).toBe('ยังไม่ระบุ')
  })

  it('ไม่แสดงปี ค.ศ. เด็ดขาด (DISPLAY_CE_YEAR)', () => {
    expect(fmtDate('2026-07-02T07:30:00Z')).not.toContain('2026')
  })
})

describe('fmtDateTime / fmtTime', () => {
  it('`DD/MM/YYYY HH:mm` ตามเวลาไทย 24 ชั่วโมง', () => {
    expect(fmtDateTime('2026-07-02T07:30:00Z')).toBe('02/07/2569 14:30')
    expect(fmtTime('2026-07-02T07:30:00Z')).toBe('14:30')
  })

  it('เที่ยงคืนเวลาไทยแสดง 00:00 ไม่ใช่ 24:00', () => {
    expect(fmtDateTime('2026-07-01T17:00:00Z')).toBe('02/07/2569 00:00')
    expect(fmtTime('2026-07-01T17:00:00Z')).toBe('00:00')
  })

  it('ค่าว่าง → fallback', () => {
    expect(fmtDateTime(null)).toBe(EMPTY_DATE_DISPLAY)
    expect(fmtTime(undefined)).toBe(EMPTY_DATE_DISPLAY)
  })
})

describe('toBangkokParts / buddhistYear / toDate', () => {
  it('แตกส่วนประกอบตามเวลาไทย (ปียังเป็น ค.ศ.)', () => {
    expect(toBangkokParts('2026-07-02T07:30:45Z')).toEqual({
      year: 2026,
      month: 7,
      day: 2,
      hour: 14,
      minute: 30,
      second: 45,
    })
  })

  it('buddhistYear = ค.ศ. + 543 ตามเวลาไทย — ใช้กับเลขเอกสาร LOT-YYYY-XXX', () => {
    expect(buddhistYear('2026-07-02T07:30:00Z')).toBe(2569)
    // 31/12 ค.ศ. 22:00 UTC = 01/01 ปีถัดไปเวลาไทย → เลขเอกสารต้องข้ามปีตามเวลาไทย
    expect(buddhistYear('2026-12-31T22:00:00Z')).toBe(2570)
  })

  it('toDate คืน null เมื่อใช้ไม่ได้', () => {
    expect(toDate(null)).toBeNull()
    expect(toDate('')).toBeNull()
    expect(toDate('xx')).toBeNull()
    expect(toDate('2026-07-02T07:30:00Z')).toBeInstanceOf(Date)
  })
})

describe('input[type=date] — ข้อยกเว้นเดียวที่ใช้ ค.ศ.', () => {
  it('toInputDate = ISO ค.ศ. อิงวันตามเวลาไทย', () => {
    expect(toInputDate('2026-07-02T07:30:00Z')).toBe('2026-07-02')
    expect(toInputDate('2026-08-13T17:30:00Z')).toBe('2026-08-14')
    expect(toInputDate(null)).toBe('')
  })

  it('fromInputDate = เที่ยงคืนเวลาไทยของวันนั้น (เก็บเป็น UTC)', () => {
    expect(fromInputDate('2026-07-02')?.toISOString()).toBe('2026-07-01T17:00:00.000Z')
    expect(fromInputDate('02/07/2569')).toBeNull()
    expect(fromInputDate('')).toBeNull()
    expect(fromInputDate(null)).toBeNull()
  })

  it('ไป-กลับแล้ววันไม่เพี้ยน', () => {
    const round = toInputDate(fromInputDate('2026-02-29') ?? new Date())
    // 2026 ไม่ใช่ปีอธิกสุรทิน — 29/02 ถูก normalize เป็น 01/03 ตามพฤติกรรม Date มาตรฐาน
    expect(round).toBe('2026-03-01')
    expect(toInputDate(fromInputDate('2026-02-28'))).toBe('2026-02-28')
  })
})

describe('nowDate / nowDateTime', () => {
  it('อิงเวลาปัจจุบันและอยู่ในรูป พ.ศ.', () => {
    const fixed = new Date('2026-08-14T02:15:00Z')
    expect(nowDate(fixed)).toBe('14/08/2569')
    expect(nowDateTime(fixed)).toBe('14/08/2569 09:15')
    expect(nowDate()).toMatch(/^\d{2}\/\d{2}\/25\d{2}$/)
  })
})

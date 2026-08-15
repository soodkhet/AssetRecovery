import { describe, expect, it } from 'vitest'
import {
  buddhistYear,
  EMPTY_DATE_DISPLAY,
  fmtDate,
  fmtDateTime,
  fmtTime,
  endOfBangkokDay,
  fromInputDate,
  fromInputDateTime,
  nowDate,
  nowDateTime,
  toBangkokParts,
  toDate,
  toInputDate,
  toInputDateTime,
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

  it('endOfBangkokDay = สิ้นวันตามเวลาไทย (16:59:59.999Z) ไม่ใช่สิ้นวัน UTC', () => {
    // วันตัดรอบ 02/07/2026 (เที่ยงคืน UTC — ผลของ `dateOnlySchema()`)
    const cutoff = new Date('2026-07-02T00:00:00.000Z')
    expect(endOfBangkokDay(cutoff).toISOString()).toBe('2026-07-02T16:59:59.999Z')
  })

  it('รายการที่เกิดเช้าวันไทยถัดไปต้องอยู่นอกขอบวันตัดรอบ', () => {
    const cutoff = new Date('2026-07-02T00:00:00.000Z')
    const bound = endOfBangkokDay(cutoff)
    // 23:59 น. ของวันที่ 2 ตามเวลาไทย = 16:59Z ⇒ ต้องอยู่ในรอบ
    expect(new Date('2026-07-02T16:59:00.000Z') <= bound).toBe(true)
    // 01:00 น. ของวันที่ 3 ตามเวลาไทย = 18:00Z ของวันที่ 2 ⇒ ต้อง **หลุด** ออกจากรอบ
    // (บั๊กเดิมใช้ `+24h-1ms` = 23:59:59.999Z ซึ่งกินไปถึง 06:59 น. ของวันไทยถัดไป)
    expect(new Date('2026-07-02T18:00:00.000Z') <= bound).toBe(false)
    expect(new Date('2026-07-02T23:00:00.000Z') <= bound).toBe(false)
  })

  it('ไป-กลับแล้ววันไม่เพี้ยน', () => {
    const round = toInputDate(fromInputDate('2026-02-29') ?? new Date())
    // 2026 ไม่ใช่ปีอธิกสุรทิน — 29/02 ถูก normalize เป็น 01/03 ตามพฤติกรรม Date มาตรฐาน
    expect(round).toBe('2026-03-01')
    expect(toInputDate(fromInputDate('2026-02-28'))).toBe('2026-02-28')
  })
})

describe('input[type=datetime-local] — วันนัด/วันส่งมอบจริงของล็อต (`44` §8.4)', () => {
  it('toInputDateTime = `YYYY-MM-DDTHH:mm` ค.ศ. ตามเวลาไทย', () => {
    expect(toInputDateTime('2026-07-02T03:00:00Z')).toBe('2026-07-02T10:00')
    // 17:30Z = 00:30 ของวันถัดไปตามเวลาไทย — วันต้องเลื่อนตามด้วย
    expect(toInputDateTime('2026-08-13T17:30:00Z')).toBe('2026-08-14T00:30')
    expect(toInputDateTime(null)).toBe('')
  })

  it('fromInputDateTime อ่านค่าที่กรอกเป็น **เวลาไทย** เสมอ (ไม่ใช่เวลาเครื่องผู้ใช้)', () => {
    expect(fromInputDateTime('2026-07-02T10:00')?.toISOString()).toBe('2026-07-02T03:00:00.000Z')
    expect(fromInputDateTime('2026-07-02T10:00:30')?.toISOString()).toBe('2026-07-02T03:00:30.000Z')
    expect(fromInputDateTime('02/07/2569 10:00')).toBeNull()
    expect(fromInputDateTime('2026-07-02')).toBeNull()
    expect(fromInputDateTime('')).toBeNull()
    expect(fromInputDateTime(null)).toBeNull()
  })

  it('ไป-กลับแล้วเวลาไม่เพี้ยน', () => {
    expect(toInputDateTime(fromInputDateTime('2026-12-31T23:59'))).toBe('2026-12-31T23:59')
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

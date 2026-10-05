import { describe, expect, it } from 'vitest'
import { dateOnlyKey, isWeekendDateOnly, nextBusinessDay } from '@/lib/format/datetime'

/** วันทำการ (มติ PO 06/10/2569 UAT U93) — เสาร์/อาทิตย์ + วันหยุดในปฏิทินองค์กร */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const key = (date: Date) => dateOnlyKey(date)

describe('nextBusinessDay', () => {
  it('วันทำการอยู่แล้ว ⇒ คืนวันเดิม', () => {
    expect(key(nextBusinessDay(d('2026-07-15')))).toBe('2026-07-15') // พุธ
    expect(key(nextBusinessDay(d('2026-11-13'), ['2026-11-12']))).toBe('2026-11-13') // ศุกร์ (วันหยุดคือพฤหัส)
  })

  it('เสาร์ ⇒ จันทร์ · อาทิตย์ ⇒ จันทร์', () => {
    expect(isWeekendDateOnly(d('2026-11-07'))).toBe(true)
    expect(key(nextBusinessDay(d('2026-11-07')))).toBe('2026-11-09')
    expect(key(nextBusinessDay(d('2026-11-15')))).toBe('2026-11-16')
  })

  it('วันหยุดต่อเนื่อง + เสาร์อาทิตย์ ⇒ ข้ามทั้งหมด', () => {
    // ศุกร์ 2026-04-10 + จันทร์ 13 + อังคาร 14 + พุธ 15 (สงกรานต์) ⇒ พฤหัส 16
    const holidays = new Set(['2026-04-10', '2026-04-13', '2026-04-14', '2026-04-15'])
    expect(key(nextBusinessDay(d('2026-04-10'), holidays))).toBe('2026-04-16')
  })

  it('ข้ามเดือน', () => {
    // 2026-07-31 ศุกร์เป็นวันหยุด ⇒ ข้ามเสาร์อาทิตย์ ⇒ จันทร์ 2026-08-03
    expect(key(nextBusinessDay(d('2026-07-31'), ['2026-07-31']))).toBe('2026-08-03')
  })

  it('ข้ามปี', () => {
    // พฤหัส 2026-12-31 + ศุกร์ 2027-01-01 หยุด ⇒ จันทร์ 2027-01-04
    expect(key(nextBusinessDay(d('2026-12-31'), ['2026-12-31', '2027-01-01']))).toBe('2027-01-04')
  })

  it('รับค่าที่มีเวลาติดมา ⇒ ตัดเหลือ date-only (UTC) · ไม่แก้ค่าที่ส่งเข้า', () => {
    const input = new Date('2026-11-07T10:30:00.000Z')
    expect(nextBusinessDay(input).toISOString()).toBe('2026-11-09T00:00:00.000Z')
    expect(input.toISOString()).toBe('2026-11-07T10:30:00.000Z')
  })

  it('วันหยุดในรายการที่ไม่เกี่ยวข้องไม่มีผล', () => {
    expect(key(nextBusinessDay(d('2026-07-15'), ['2026-07-14', '2026-07-16']))).toBe('2026-07-15')
  })
})

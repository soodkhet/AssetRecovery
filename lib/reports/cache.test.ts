import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearReportCache, nextBangkokMidnight, withDailyCache } from '@/lib/reports/cache'

beforeEach(() => {
  clearReportCache()
})

describe('nextBangkokMidnight', () => {
  it('เที่ยงคืนไทยถัดไป = 17:00Z ของวันก่อนหน้า', () => {
    // 15/08/2026 10:00Z = 17:00 ตามเวลาไทย ⇒ เที่ยงคืนถัดไป = 16/08 00:00 ไทย = 15/08 17:00Z
    expect(nextBangkokMidnight(new Date('2026-08-15T10:00:00Z')).toISOString()).toBe('2026-08-15T17:00:00.000Z')
  })

  it('เวลาหลัง 17:00Z (วันไทยใหม่แล้ว) เลื่อนไปเที่ยงคืนของวันไทยถัดไป', () => {
    // 15/08 18:00Z = 16/08 01:00 ไทย ⇒ หมดอายุ 17/08 00:00 ไทย = 16/08 17:00Z
    expect(nextBangkokMidnight(new Date('2026-08-15T18:00:00Z')).toISOString()).toBe('2026-08-16T17:00:00.000Z')
  })

  it('ข้ามสิ้นเดือน/สิ้นปีได้ถูกต้อง', () => {
    expect(nextBangkokMidnight(new Date('2026-12-31T10:00:00Z')).toISOString()).toBe('2026-12-31T17:00:00.000Z')
    expect(nextBangkokMidnight(new Date('2026-12-31T18:00:00Z')).toISOString()).toBe('2027-01-01T17:00:00.000Z')
  })

  it('เวลาไม่ถูกต้อง ⇒ โยน', () => {
    expect(() => nextBangkokMidnight(new Date('ไม่ใช่เวลา'))).toThrow(RangeError)
  })
})

describe('withDailyCache', () => {
  const now = new Date('2026-08-15T10:00:00Z')

  it('ครั้งแรกคำนวณสด ครั้งที่สองในวันเดียวกันได้จากแคช (คำนวณครั้งเดียว)', async () => {
    const compute = vi.fn(async () => 42)

    const first = await withDailyCache('k', { refresh: false, now }, compute)
    const second = await withDailyCache('k', { refresh: false, now: new Date('2026-08-15T14:00:00Z') }, compute)

    expect(first).toMatchObject({ value: 42, fromCache: false })
    expect(second).toMatchObject({ value: 42, fromCache: true })
    expect(second.computedAt).toEqual(now)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('`refresh = true` ข้ามแคชแล้วเขียนทับ (ปุ่ม "รีเฟรชตอนนี้")', async () => {
    let value = 1
    const compute = vi.fn(async () => value)

    await withDailyCache('k', { refresh: false, now }, compute)
    value = 2
    const refreshed = await withDailyCache('k', { refresh: true, now }, compute)
    const afterRefresh = await withDailyCache('k', { refresh: false, now }, compute)

    expect(refreshed).toMatchObject({ value: 2, fromCache: false })
    expect(afterRefresh).toMatchObject({ value: 2, fromCache: true })
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('ข้ามเที่ยงคืนไทยแล้วคำนวณใหม่', async () => {
    const compute = vi.fn(async () => 7)

    await withDailyCache('k', { refresh: false, now }, compute)
    const nextDay = await withDailyCache('k', { refresh: false, now: new Date('2026-08-15T17:00:01Z') }, compute)

    expect(nextDay.fromCache).toBe(false)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('คีย์ต่างกัน (คนละองค์กร/คนละมิติ) ไม่ปนกัน', async () => {
    const a = await withDailyCache('org-a', { refresh: false, now }, async () => 'A')
    const b = await withDailyCache('org-b', { refresh: false, now }, async () => 'B')

    expect(a.value).toBe('A')
    expect(b.value).toBe('B')
    expect((await withDailyCache('org-a', { refresh: false, now }, async () => 'X')).value).toBe('A')
  })

  it('idempotent — คำนวณซ้ำได้ค่าเดิมเสมอ (อ่านอย่างเดียว)', async () => {
    const compute = async () => ({ total: 100 })
    const first = await withDailyCache('k', { refresh: true, now }, compute)
    const second = await withDailyCache('k', { refresh: true, now }, compute)
    expect(second.value).toEqual(first.value)
  })
})

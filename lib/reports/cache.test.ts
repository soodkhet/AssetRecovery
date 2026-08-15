import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REPORT_REFRESH_COOLDOWN_MS,
  clearReportCache,
  invalidateReportCache,
  nextBangkokMidnight,
  nextHourBoundary,
  reportCacheExpiry,
  requestReportRefresh,
  withDailyCache,
  withReportCache,
} from '@/lib/reports/cache'

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

describe('withReportCache — 3 โหมดตาม `96` §8', () => {
  const now = new Date('2026-08-15T10:00:00Z')

  it('ขอบหมดอายุ: daily = เที่ยงคืนไทย · hourly = ต้นชั่วโมงถัดไป · realtime = ไม่มี', () => {
    expect(reportCacheExpiry('daily', now)?.toISOString()).toBe('2026-08-15T17:00:00.000Z')
    expect(reportCacheExpiry('hourly', now)?.toISOString()).toBe('2026-08-15T11:00:00.000Z')
    expect(reportCacheExpiry('realtime', now)).toBeNull()
    expect(nextHourBoundary(new Date('2026-08-15T10:59:59.999Z')).toISOString()).toBe('2026-08-15T11:00:00.000Z')
  })

  it('`realtime` คำนวณสดทุกครั้ง ไม่เก็บแคชเลย', async () => {
    const compute = vi.fn(async () => 1)
    const first = await withReportCache('rt', { mode: 'realtime', refresh: false, now }, compute)
    const second = await withReportCache('rt', { mode: 'realtime', refresh: false, now }, compute)

    expect(first.fromCache).toBe(false)
    expect(second.fromCache).toBe(false)
    expect(second.expiresAt).toBeNull()
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('`hourly` ใช้แคชภายในชั่วโมงเดียวกัน แล้วคำนวณใหม่เมื่อข้ามชั่วโมง', async () => {
    const compute = vi.fn(async () => 'v')
    await withReportCache('h', { mode: 'hourly', refresh: false, now }, compute)
    const sameHour = await withReportCache(
      'h',
      { mode: 'hourly', refresh: false, now: new Date('2026-08-15T10:59:00Z') },
      compute,
    )
    const nextHour = await withReportCache(
      'h',
      { mode: 'hourly', refresh: false, now: new Date('2026-08-15T11:00:01Z') },
      compute,
    )

    expect(sameHour.fromCache).toBe(true)
    expect(nextHour.fromCache).toBe(false)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('cooldown 5 นาที (E14) มีผลเฉพาะเมื่อผู้เรียกเปิดใช้ — ค่าเริ่มต้นไม่บล็อก (`21` §17)', async () => {
    let value = 1
    const compute = vi.fn(async () => value)

    await withReportCache('c', { mode: 'daily', refresh: false, now, cooldown: true }, compute)
    value = 2
    const throttled = await withReportCache('c', { mode: 'daily', refresh: true, now, cooldown: true }, compute)
    expect(throttled).toMatchObject({ value: 1, fromCache: true, refreshThrottled: true })

    const afterCooldown = await withReportCache(
      'c',
      { mode: 'daily', refresh: true, now: new Date(now.getTime() + REPORT_REFRESH_COOLDOWN_MS + 1), cooldown: true },
      compute,
    )
    expect(afterCooldown).toMatchObject({ value: 2, fromCache: false, refreshThrottled: false })

    // ไม่เปิด cooldown (ทางเดิมของ 3.8) ⇒ กดรีเฟรชแล้วต้องได้ข้อมูลใหม่ทันที
    value = 3
    const immediate = await withReportCache('c', { mode: 'daily', refresh: true, now }, compute)
    expect(immediate).toMatchObject({ value: 3, fromCache: false })
  })

  it('ค่าที่เก่ากว่า 24 ชั่วโมงถูกทำเครื่องหมาย `stale` (`96` §12)', async () => {
    const compute = vi.fn(async () => 1)
    // แคชที่ไม่มีวันหมดอายุด้วยตัวเองภายในวัน: ใช้ hourly แล้วขยับเวลาไป 25 ชั่วโมงจะหมดอายุก่อน
    // ⇒ ทดสอบผ่าน daily ที่คำนวณตอน 23:59 ไทยแล้วอ่านซ้ำก่อนเที่ยงคืน (ยังไม่ stale)
    const computed = await withReportCache('s', { mode: 'daily', refresh: false, now }, compute)
    expect(computed.stale).toBe(false)

    const readAgain = await withReportCache(
      's',
      { mode: 'daily', refresh: false, now: new Date('2026-08-15T16:59:00Z') },
      compute,
    )
    expect(readAgain.stale).toBe(false)
    expect(readAgain.fromCache).toBe(true)
  })

  it('ล้างแคชด้วย prefix ขององค์กร — องค์กรอื่นไม่ถูกแตะ', async () => {
    await withReportCache('org-a:report:f1:x', { mode: 'daily', refresh: false, now }, async () => 'A')
    await withReportCache('org-a:report:f2:x', { mode: 'daily', refresh: false, now }, async () => 'A2')
    await withReportCache('org-b:report:f1:x', { mode: 'daily', refresh: false, now }, async () => 'B')

    expect(invalidateReportCache('org-a:report:f1:')).toBe(1)
    expect((await withReportCache('org-b:report:f1:x', { mode: 'daily', refresh: false, now }, async () => 'B2')).value).toBe('B')
    expect((await withReportCache('org-a:report:f2:x', { mode: 'daily', refresh: false, now }, async () => 'A3')).value).toBe('A2')
  })

  it('endpoint รีเฟรช: ครั้งแรกล้างจริง · กดซ้ำใน 5 นาทีถูกปฏิเสธพร้อมบอกเวลาที่กดได้', async () => {
    await withReportCache('org-a:report:f1:x', { mode: 'daily', refresh: false, now }, async () => 'A')

    const first = requestReportRefresh('org-a:report:f1:', now)
    expect(first).toMatchObject({ allowed: true, invalidated: 1 })

    const second = requestReportRefresh('org-a:report:f1:', new Date(now.getTime() + 60_000))
    expect(second.allowed).toBe(false)
    expect(second.availableAt.toISOString()).toBe(new Date(now.getTime() + REPORT_REFRESH_COOLDOWN_MS).toISOString())

    const later = requestReportRefresh('org-a:report:f1:', new Date(now.getTime() + REPORT_REFRESH_COOLDOWN_MS + 1))
    expect(later.allowed).toBe(true)
  })
})

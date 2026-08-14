import { describe, expect, it } from 'vitest'
import {
  kmHundredthsToDecimalString,
  legCacheKey,
  metersToKmHundredths,
  routeLegs,
  routePoints,
  sumLegMeters,
} from '@/lib/field/distance'

const origin = { latitude: 13.7563, longitude: 100.5018 }
const at = (iso: string): Date => new Date(iso)

describe('routePoints — ลำดับจุดคำนวณ (`41` §6.4.2)', () => {
  it('จุดเริ่มเดินทางมาก่อน แล้วเช็คอินเรียงตามเวลาจริง ไม่ใช่ลำดับที่ส่งมา', () => {
    const points = routePoints(origin, [
      { latitude: 13.9, longitude: 100.9, checkedInAt: at('2026-08-14T05:00:00Z') },
      { latitude: 13.8, longitude: 100.6, checkedInAt: at('2026-08-14T03:00:00Z') },
      { latitude: 14.0, longitude: 101.0, checkedInAt: at('2026-08-14T04:00:00Z') },
    ])

    expect(points).toEqual([
      origin,
      { latitude: 13.8, longitude: 100.6 },
      { latitude: 14.0, longitude: 101.0 },
      { latitude: 13.9, longitude: 100.9 },
    ])
  })

  it('ไม่มีเช็คอิน = มีแต่จุดเริ่ม ⇒ ไม่มีช่วงให้คำนวณ', () => {
    expect(routeLegs(routePoints(origin, []))).toEqual([])
  })

  it('เช็คอิน 3 จุด = 3 ช่วงต่อกัน (origin→1→2→3) ไม่ใช่ origin→จุดไกลสุด', () => {
    const legs = routeLegs(
      routePoints(origin, [
        { latitude: 13.8, longitude: 100.6, checkedInAt: at('2026-08-14T03:00:00Z') },
        { latitude: 13.9, longitude: 100.7, checkedInAt: at('2026-08-14T04:00:00Z') },
        { latitude: 13.7, longitude: 100.5, checkedInAt: at('2026-08-14T05:00:00Z') },
      ]),
    )

    expect(legs).toHaveLength(3)
    expect(legs[0]?.from).toEqual(origin)
    expect(legs[2]?.to).toEqual({ latitude: 13.7, longitude: 100.5 })
  })
})

describe('sumLegMeters', () => {
  it('รวมทุกช่วง', () => {
    expect(sumLegMeters([1200, 3400, 500])).toBe(5100)
  })

  it('ระยะทางติดลบ/ไม่ใช่ตัวเลขจากปลายทาง = โยนทิ้ง ไม่คิดเป็น 0 เงียบ ๆ', () => {
    expect(() => sumLegMeters([100, -5])).toThrow(RangeError)
    expect(() => sumLegMeters([Number.NaN])).toThrow(RangeError)
  })
})

describe('metersToKmHundredths / kmHundredthsToDecimalString', () => {
  it('เมตร → ร้อยของกิโลเมตร ปัดครึ่งขึ้นครั้งเดียว', () => {
    expect(metersToKmHundredths(12_345)).toBe(1235)
    expect(metersToKmHundredths(0)).toBe(0)
    expect(metersToKmHundredths(4)).toBe(0)
    expect(metersToKmHundredths(5)).toBe(1)
  })

  it('แปลงเป็นค่าคอลัมน์ NUMERIC(10,2) เป็น string เสมอ (ไม่ให้ float ปัดเศษระหว่างทาง)', () => {
    expect(kmHundredthsToDecimalString(1235)).toBe('12.35')
    expect(kmHundredthsToDecimalString(1200)).toBe('12.00')
    expect(kmHundredthsToDecimalString(5)).toBe('0.05')
    expect(kmHundredthsToDecimalString(0)).toBe('0.00')
  })
})

describe('legCacheKey', () => {
  it('พิกัดที่ต่างกันต่ำกว่า ~1 เมตร ใช้ผลลัพธ์เดิม (ลดจำนวน API call)', () => {
    const a = legCacheKey({ from: origin, to: { latitude: 13.8, longitude: 100.6 } })
    const b = legCacheKey({ from: origin, to: { latitude: 13.800000_4, longitude: 100.6 } })
    expect(a).toBe(b)
  })

  it('สลับทิศทางถือเป็นคนละช่วง', () => {
    const to = { latitude: 13.8, longitude: 100.6 }
    expect(legCacheKey({ from: origin, to })).not.toBe(legCacheKey({ from: to, to: origin }))
  })
})

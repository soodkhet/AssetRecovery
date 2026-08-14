import { describe, expect, it } from 'vitest'
import {
  clampLatitude,
  formatCoordinates,
  metersPerPixel,
  panCenter,
  staticMapUrl,
  wrapLongitude,
} from '@/lib/field/map-pan'

const BANGKOK = { latitude: 13.7563, longitude: 100.5018 }

describe('clampLatitude / wrapLongitude', () => {
  it('ตัดละติจูดที่เกินขอบ Web Mercator', () => {
    expect(clampLatitude(95)).toBeCloseTo(85.05112878, 6)
    expect(clampLatitude(-95)).toBeCloseTo(-85.05112878, 6)
    expect(clampLatitude(13.7563)).toBe(13.7563)
  })

  it('วนลองจิจูดให้อยู่ในช่วง −180…180', () => {
    expect(wrapLongitude(190)).toBeCloseTo(-170, 9)
    expect(wrapLongitude(-190)).toBeCloseTo(170, 9)
    expect(wrapLongitude(100.5)).toBeCloseTo(100.5, 9)
  })
})

describe('metersPerPixel', () => {
  it('zoom สูงขึ้น 1 ระดับ = ระยะต่อพิกเซลลดลงครึ่งหนึ่ง', () => {
    expect(metersPerPixel(BANGKOK.latitude, 16)).toBeCloseTo(metersPerPixel(BANGKOK.latitude, 15) / 2, 9)
  })
})

describe('panCenter', () => {
  it('ไม่ลาก = พิกัดเดิม', () => {
    const next = panCenter(BANGKOK, 15, 0, 0)
    expect(next.latitude).toBeCloseTo(BANGKOK.latitude, 9)
    expect(next.longitude).toBeCloseTo(BANGKOK.longitude, 9)
  })

  it('ลากรูปไปขวา = หมุดขยับไปทางตะวันตก (ลองจิจูดลดลง)', () => {
    expect(panCenter(BANGKOK, 15, 100, 0).longitude).toBeLessThan(BANGKOK.longitude)
  })

  it('ลากรูปลง = หมุดขยับขึ้นเหนือ (ละติจูดเพิ่ม)', () => {
    expect(panCenter(BANGKOK, 15, 0, 100).latitude).toBeGreaterThan(BANGKOK.latitude)
  })

  it('ลากกลับตำแหน่งเดิมได้พิกัดเดิม (ผันกลับได้)', () => {
    const moved = panCenter(BANGKOK, 15, 120, -80)
    const back = panCenter(moved, 15, -120, 80)
    expect(back.latitude).toBeCloseTo(BANGKOK.latitude, 9)
    expect(back.longitude).toBeCloseTo(BANGKOK.longitude, 9)
  })

  it('ระยะที่ขยับสอดคล้องกับ metersPerPixel ที่ zoom นั้น', () => {
    const zoom = 15
    const moved = panCenter(BANGKOK, zoom, -256, 0) // ลากไปซ้าย 1 tile = ไปทางตะวันออก
    const movedMeters =
      ((moved.longitude - BANGKOK.longitude) * 40_075_016.686 * Math.cos((BANGKOK.latitude * Math.PI) / 180)) / 360
    expect(movedMeters).toBeCloseTo(256 * metersPerPixel(BANGKOK.latitude, zoom), 3)
  })
})

describe('staticMapUrl / formatCoordinates', () => {
  it('ประกอบ URL ของ static map พร้อมหมุดสีที่กำหนด', () => {
    const url = staticMapUrl(BANGKOK, { zoom: 14, width: 400, height: 130, marker: 'blue-pushpin' })
    expect(url).toContain('center=13.756300,100.501800')
    expect(url).toContain('zoom=14')
    expect(url).toContain('size=400x130')
    expect(url).toContain('markers=13.756300,100.501800,blue-pushpin')
  })

  it('ค่าตั้งต้น = หมุดแดง zoom 15', () => {
    const url = staticMapUrl(BANGKOK)
    expect(url).toContain('zoom=15')
    expect(url).toContain('red-pushpin')
  })

  it('พิกัดบนหน้าจอเป็นทศนิยม 6 ตำแหน่งเสมอ', () => {
    expect(formatCoordinates({ latitude: 13.7, longitude: 100 })).toBe('13.700000, 100.000000')
  })
})

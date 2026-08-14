/**
 * ระยะทางของค่าน้ำมันโหมด `PER_KM` (`41` §6.4.2 · `22` §6.1) — **pure ล้วน ไม่มี I/O**
 * ตัวเรียก Google Distance Matrix จริงอยู่ที่ `lib/field/distance-provider.ts`
 *
 * กติกาที่บังคับที่นี่:
 * - ลำดับจุด = `travel_origin → checkin[1] → … → checkin[n]` **ตามลำดับเวลาที่เช็คอินจริง**
 *   (ไม่ใช่ origin → จุดไกลสุด — `41` §20 มีเทสต์ข้อนี้โดยเฉพาะ)
 * - ระยะทางรวม = ผลรวมของทุกช่วงต่อกัน
 * - หน่วยภายในเป็น **จำนวนเต็มเสมอ** (เมตร / ร้อยของกิโลเมตร) เพื่อให้ยอดเงินคำนวณซ้ำได้ตรงเป๊ะ
 *   — ค่าที่เก็บลง `expenses.distance_km` คือ "ร้อยของกิโลเมตร ÷ 100" ตัวเดียวกับที่ใช้คูณ rate
 */

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface TimedGeoPoint extends GeoPoint {
  /** เวลาเช็คอินจริง — ใช้เรียงลำดับเท่านั้น */
  checkedInAt: Date
}

export interface RouteLeg {
  from: GeoPoint
  to: GeoPoint
}

/**
 * ลำดับจุดคำนวณตาม `41` §6.4.2 — จุดเริ่มเดินทางมาก่อนเสมอ แล้วตามด้วยเช็คอินเรียงตามเวลา
 * เช็คอินที่เวลาเท่ากันเป๊ะให้คงลำดับเดิมที่ส่งเข้ามา (stable sort ของ JS)
 */
export function routePoints(origin: GeoPoint, checkins: readonly TimedGeoPoint[]): GeoPoint[] {
  const ordered = [...checkins].sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime())
  return [origin, ...ordered.map((point) => ({ latitude: point.latitude, longitude: point.longitude }))]
}

/** ช่วงต่อเนื่องของเส้นทาง — n จุด = n-1 ช่วง (จุดเดียว = ไม่มีช่วง ⇒ ระยะทาง 0) */
export function routeLegs(points: readonly GeoPoint[]): RouteLeg[] {
  const legs: RouteLeg[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (from === undefined || to === undefined) continue
    legs.push({ from, to })
  }
  return legs
}

/** ผลรวมระยะทางของทุกช่วง (เมตร) — ค่าติดลบ/ไม่ใช่ตัวเลข = ข้อมูลจากปลายทางเสีย ⇒ โยนทิ้ง */
export function sumLegMeters(legMeters: readonly number[]): number {
  let total = 0
  for (const meters of legMeters) {
    if (!Number.isFinite(meters) || meters < 0) {
      throw new RangeError(`ระยะทางที่ได้จากปลายทางไม่ถูกต้อง: ${meters}`)
    }
    total += Math.round(meters)
  }
  return total
}

/**
 * เมตร → **ร้อยของกิโลเมตร** (จำนวนเต็ม) = ค่าที่เก็บลง `expenses.distance_km` คูณ 100
 * ปัดครึ่งขึ้นครั้งเดียวที่นี่ที่เดียว เพื่อให้ `distance_km` ที่แสดงกับยอดเงินตรงกันเสมอ
 */
export function metersToKmHundredths(meters: number): number {
  if (!Number.isFinite(meters) || meters < 0) throw new RangeError(`ระยะทางไม่ถูกต้อง: ${meters}`)
  return Math.round(meters / 10)
}

/** ค่าที่เขียนลงคอลัมน์ `NUMERIC(10,2)` — string เพื่อไม่ให้ float เข้ามาปัดเศษระหว่างทาง */
export function kmHundredthsToDecimalString(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100)
  const fraction = Math.abs(hundredths % 100)
  return `${whole}.${String(fraction).padStart(2, '0')}`
}

/**
 * คีย์ cache ของช่วงหนึ่ง — ปัดพิกัดเหลือ 5 ตำแหน่ง (~1 เมตร) เพื่อให้เช็คอินจุดเดิมที่ GPS
 * สั่นเล็กน้อยยังใช้ผลเดิมได้ (ลดจำนวน API call ตาม `41` §6.4.2)
 */
export function legCacheKey(leg: RouteLeg): string {
  const fixed = (value: number): string => value.toFixed(5)
  return `${fixed(leg.from.latitude)},${fixed(leg.from.longitude)}|${fixed(leg.to.latitude)},${fixed(leg.to.longitude)}`
}

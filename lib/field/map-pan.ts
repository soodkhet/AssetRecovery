/**
 * แผนที่แบบรูปนิ่ง (static map) ของฟอร์มปิดงาน (`41` §6.4 · §7.6) — **pure ล้วน**
 *
 * ใช้ static map ของ OpenStreetMap ตัวเดียวกับ mockup (ไม่ต้องมี API key และไม่เพิ่ม dependency)
 * — จุดเช็คอินเป็นรูป**ดูอย่างเดียว** ส่วนจุดเริ่มเดินทางลากปรับตำแหน่งได้ (§6.4.1)
 *
 * การ "ลากปรับตำแหน่ง" ทำโดยเลื่อนรูปแล้วแปลงระยะพิกเซลกลับเป็นพิกัดด้วยสูตร Web Mercator
 * ({@link panCenter}) — หมุดอยู่กลางกรอบเสมอ ⇒ ลากรูปไปทางไหน = ย้ายหมุดไปทางตรงข้ามเท่านั้น
 *
 * ⚠️ ตัวเลขที่ได้จากที่นี่ใช้เป็น **จุดอ้างอิงคำนวณค่าน้ำมัน** เท่านั้น ไม่ใช่หลักฐาน (§6.4.1)
 * — พิกัดของ `evidence.checkins` ต้องมาจาก Geolocation API ของอุปกรณ์เสมอ ห้ามผ่านตัวนี้
 */

export interface MapPoint {
  latitude: number
  longitude: number
}

/** ขนาดกระเบื้องมาตรฐานของ Web Mercator (256px ต่อ tile) */
const TILE_SIZE = 256

/** ละติจูดสูงสุดที่ Web Mercator แสดงได้ — เกินกว่านี้สูตรจะระเบิด */
const MAX_LATITUDE = 85.05112878

export function clampLatitude(latitude: number): number {
  return Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, latitude))
}

/** ลองจิจูดวนรอบโลก (−180…180) — ลากข้ามเส้นแบ่งวันแล้วต้องไม่ได้ค่าเพี้ยน */
export function wrapLongitude(longitude: number): number {
  const wrapped = ((longitude + 180) % 360 + 360) % 360
  return wrapped - 180
}

/** เมตรต่อพิกเซลที่ zoom/ละติจูดหนึ่ง ๆ (เส้นรอบวงโลกที่เส้นศูนย์สูตร 40,075,016.686 ม.) */
export function metersPerPixel(latitude: number, zoom: number): number {
  return (40_075_016.686 * Math.cos((clampLatitude(latitude) * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom)
}

/**
 * จุดศูนย์กลางใหม่หลังลากรูปไป `dxPixels`/`dyPixels` (แกนหน้าจอ: ขวา = +x, ลง = +y)
 *
 * ลากรูปไปทางขวา = มองไปทาง**ตะวันตก** ⇒ ลองจิจูดลดลง (จึงเป็นเครื่องหมายลบทั้งคู่)
 */
export function panCenter(center: MapPoint, zoom: number, dxPixels: number, dyPixels: number): MapPoint {
  const scale = TILE_SIZE * 2 ** zoom
  const latitude = clampLatitude(center.latitude)

  // world coordinate (0…scale) ของจุดศูนย์กลางปัจจุบัน
  const worldX = ((wrapLongitude(center.longitude) + 180) / 360) * scale
  const sinLatitude = Math.sin((latitude * Math.PI) / 180)
  const worldY = (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale

  const nextX = worldX - dxPixels
  const nextY = worldY - dyPixels

  const nextLongitude = (nextX / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * nextY) / scale
  const nextLatitude = (180 / Math.PI) * Math.atan(Math.sinh(n))

  return { latitude: clampLatitude(nextLatitude), longitude: wrapLongitude(nextLongitude) }
}

export interface StaticMapOptions {
  zoom?: number
  width?: number
  height?: number
  /** สีหมุดของ staticmap.openstreetmap.de — เช็คอิน = แดง · จุดเริ่มเดินทาง = น้ำเงิน (mockup §7.6) */
  marker?: 'red-pushpin' | 'blue-pushpin'
}

/** URL รูปแผนที่นิ่ง — ปัดพิกัด 6 ตำแหน่ง (≈0.1 ม.) เพื่อให้ URL ซ้ำเดิม เบราว์เซอร์ cache ได้ */
export function staticMapUrl(point: MapPoint, options: StaticMapOptions = {}): string {
  const zoom = options.zoom ?? 15
  const width = options.width ?? 400
  const height = options.height ?? 150
  const marker = options.marker ?? 'red-pushpin'
  const latitude = clampLatitude(point.latitude).toFixed(6)
  const longitude = wrapLongitude(point.longitude).toFixed(6)

  return (
    'https://staticmap.openstreetmap.de/staticmap.php' +
    `?center=${latitude},${longitude}&zoom=${zoom}&size=${width}x${height}` +
    `&markers=${latitude},${longitude},${marker}`
  )
}

/** พิกัดแบบอ่านง่ายบนหน้าจอ (6 ตำแหน่ง) — แสดงคู่กับแผนที่เสมอเพื่อให้ตรวจสอบย้อนหลังได้ */
export function formatCoordinates(point: MapPoint): string {
  return `${clampLatitude(point.latitude).toFixed(6)}, ${wrapLongitude(point.longitude).toFixed(6)}`
}

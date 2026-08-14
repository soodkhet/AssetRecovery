/**
 * พิกัดจาก **Geolocation API ของอุปกรณ์จริง** (`41` §11) — ฝั่ง browser เท่านั้น
 *
 * ⚠️ ระบบ**ไม่มีช่องกรอกพิกัดมือ**เด็ดขาด — ทุกจุดเช็คอินต้องมาจากที่นี่
 * (ยามชั้นสุดท้ายฝั่ง API คือ `assertDeviceCoordinates()` ของ `lib/field/evidence.ts`)
 */

export interface DevicePosition {
  latitude: number
  longitude: number
  /** ความคลาดเคลื่อนโดยประมาณ (เมตร) ที่อุปกรณ์รายงานมา — แสดงให้ผู้ใช้เห็นบนแผนที่ */
  accuracyMeters: number | null
}

export class GeolocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeolocationError'
  }
}

const MESSAGE_BY_CODE: Readonly<Record<number, string>> = {
  1: 'อุปกรณ์ปิดสิทธิ์ตำแหน่งไว้ — เปิดสิทธิ์ตำแหน่งให้เบราว์เซอร์แล้วลองใหม่',
  2: 'อุปกรณ์หาพิกัดไม่ได้ในตอนนี้ — ลองออกไปที่โล่งแล้วลองใหม่',
  3: 'รอพิกัดนานเกินไป — ลองใหม่อีกครั้ง',
}

/** ขอพิกัดปัจจุบัน — timeout 15 วินาที และไม่ใช้ค่าที่ cache ไว้ (ต้องเป็นตำแหน่ง ณ ตอนนั้นจริง) */
export async function currentPosition(): Promise<DevicePosition> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
    throw new GeolocationError('อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับการดึงพิกัด GPS')
  }

  return new Promise<DevicePosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        })
      },
      (error) => {
        reject(new GeolocationError(MESSAGE_BY_CODE[error.code] ?? 'ดึงพิกัดจากอุปกรณ์ไม่สำเร็จ'))
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  })
}

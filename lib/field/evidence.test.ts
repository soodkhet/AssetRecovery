import { describe, expect, it } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import {
  assertCloseEvidence,
  assertDeviceCoordinates,
  hasEvidenceRevision,
  missingCloseEvidence,
  type CloseEvidenceInput,
} from '@/lib/field/evidence'

function codeOf(fn: () => void): string {
  try {
    fn()
    return 'NO_ERROR'
  } catch (error) {
    return error instanceof ModuleError ? error.code : 'UNKNOWN'
  }
}

/** หลักฐานครบตาม outcome สำเร็จ ของทีม PER_KM (เคสที่ผ่านทุกเงื่อนไข) */
const COMPLETE: CloseEvidenceInput = {
  outcome: 'closed_success',
  checkinCount: 1,
  photoCount: 1,
  videoCount: 1,
  productPhotoCount: 1,
  hasTravelOrigin: true,
  fuelMode: 'PER_KM',
}

describe('หลักฐานปิดงาน (`41` §11 · §12 · §20)', () => {
  it('ครบทุกอย่างแล้วผ่าน', () => {
    expect(missingCloseEvidence(COMPLETE)).toEqual([])
    expect(codeOf(() => assertCloseEvidence(COMPLETE))).toBe('NO_ERROR')
  })

  it('ยังไม่เลือก outcome = CLOSE_OUTCOME_REQUIRED', () => {
    expect(codeOf(() => assertCloseEvidence({ ...COMPLETE, outcome: null }))).toBe('CLOSE_OUTCOME_REQUIRED')
  })

  it('ไม่มีเช็คอิน/รูป/วิดีโอ = code ของแต่ละอย่าง', () => {
    expect(codeOf(() => assertCloseEvidence({ ...COMPLETE, checkinCount: 0 }))).toBe('CLOSE_CHECKIN_REQUIRED')
    expect(codeOf(() => assertCloseEvidence({ ...COMPLETE, photoCount: 0 }))).toBe('CLOSE_PHOTO_REQUIRED')
    expect(codeOf(() => assertCloseEvidence({ ...COMPLETE, videoCount: 0 }))).toBe('CLOSE_VIDEO_REQUIRED')
  })

  it('§20 "มีแค่เช็คอิน" ต้องบอกครบว่าขาดรูปและวิดีโอ ไม่ใช่บอกทีละอย่าง', () => {
    const missing = missingCloseEvidence({ ...COMPLETE, photoCount: 0, videoCount: 0, productPhotoCount: 0 })
    expect(missing).toEqual(['CLOSE_PHOTO_REQUIRED', 'CLOSE_VIDEO_REQUIRED', 'CLOSE_PRODUCT_PHOTO_REQUIRED'])
  })

  it('สำเร็จต้องมีรูปสินค้า · ไม่สำเร็จไม่ต้องมี (§11)', () => {
    expect(codeOf(() => assertCloseEvidence({ ...COMPLETE, productPhotoCount: 0 }))).toBe(
      'CLOSE_PRODUCT_PHOTO_REQUIRED',
    )
    expect(codeOf(() => assertCloseEvidence({ ...COMPLETE, outcome: 'closed_fail', productPhotoCount: 0 }))).toBe(
      'NO_ERROR',
    )
  })

  it('เสียงไม่บังคับทั้ง 2 outcome (ไม่มีในรายการที่ตรวจเลย)', () => {
    expect(missingCloseEvidence({ ...COMPLETE, outcome: 'closed_fail', productPhotoCount: 0 })).toEqual([])
  })

  it('ทีม PER_KM ไม่มีจุดเริ่มเดินทาง = CLOSE_TRAVEL_ORIGIN_REQUIRED', () => {
    expect(codeOf(() => assertCloseEvidence({ ...COMPLETE, hasTravelOrigin: false }))).toBe(
      'CLOSE_TRAVEL_ORIGIN_REQUIRED',
    )
  })

  it('ทีม DAILY_FLAT ปิดงานได้โดยไม่ต้องมีจุดเริ่มเดินทางเลย (§20)', () => {
    const dailyFlat: CloseEvidenceInput = { ...COMPLETE, fuelMode: 'DAILY_FLAT', hasTravelOrigin: false }
    expect(missingCloseEvidence(dailyFlat)).toEqual([])
    expect(codeOf(() => assertCloseEvidence(dailyFlat))).toBe('NO_ERROR')
  })

  it('ไม่มีแผนค่าตอบแทนผูกกับทีม = ไม่บังคับจุดเริ่มเดินทาง', () => {
    expect(missingCloseEvidence({ ...COMPLETE, fuelMode: null, hasTravelOrigin: false })).toEqual([])
  })

  it('แนบรายการที่ขาดทั้งหมดมากับ error เพื่อให้หน้าจอแสดงครบครั้งเดียว', () => {
    try {
      assertCloseEvidence({ ...COMPLETE, checkinCount: 0, photoCount: 0 })
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(error).toBeInstanceOf(ModuleError)
      expect((error as ModuleError).context?.missing).toEqual(['CLOSE_CHECKIN_REQUIRED', 'CLOSE_PHOTO_REQUIRED'])
    }
  })
})

describe('ยามพิกัด GPS จริง (`41` §11 — ห้ามกรอกพิกัดมือ)', () => {
  it('พิกัดปกติผ่าน', () => {
    expect(codeOf(() => assertDeviceCoordinates(13.7563, 100.5018))).toBe('NO_ERROR')
  })

  it('พิกัดนอกช่วง/ไม่ใช่ตัวเลข/(0,0) ถูกปฏิเสธ', () => {
    expect(codeOf(() => assertDeviceCoordinates(91, 100))).toBe('CHECKIN_GPS_PERMISSION_DENIED')
    expect(codeOf(() => assertDeviceCoordinates(13, 181))).toBe('CHECKIN_GPS_PERMISSION_DENIED')
    expect(codeOf(() => assertDeviceCoordinates(Number.NaN, 100))).toBe('CHECKIN_GPS_PERMISSION_DENIED')
    expect(codeOf(() => assertDeviceCoordinates(0, 0))).toBe('CHECKIN_GPS_PERMISSION_DENIED')
  })
})

describe('ต้องแก้สื่ออย่างน้อย 1 รายการก่อน resubmit (`41` §8)', () => {
  const before = {
    photos: ['a.jpg', 'b.jpg'],
    videos: ['v.mp4'],
    productPhotos: ['p.jpg'],
    audioUrl: null,
  }

  it('ไม่แก้อะไรเลย = false (ลำดับไฟล์สลับไม่ถือว่าแก้)', () => {
    expect(hasEvidenceRevision(before, { ...before, photos: ['b.jpg', 'a.jpg'] })).toBe(false)
  })

  it('เพิ่ม/ลบ/แทนที่ไฟล์ หรือเพิ่มเสียง = true', () => {
    expect(hasEvidenceRevision(before, { ...before, photos: ['a.jpg', 'b.jpg', 'c.jpg'] })).toBe(true)
    expect(hasEvidenceRevision(before, { ...before, videos: [] })).toBe(true)
    expect(hasEvidenceRevision(before, { ...before, productPhotos: ['p2.jpg'] })).toBe(true)
    expect(hasEvidenceRevision(before, { ...before, audioUrl: 'a.m4a' })).toBe(true)
  })
})

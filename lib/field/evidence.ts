import { FieldError, type FieldErrorCode } from '@/lib/field/errors'
import type { CaseOutcome, FuelMode } from '@/lib/generated/prisma/enums'

/**
 * หลักฐานบังคับตอนปิดงาน (ไฟล์ 41 §6.4 · §11 · §12) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * กติกา (`41` §11): เช็คอิน ≥1 · รูป ≥1 · วิดีโอ ≥1 ทุก outcome ·
 * รูปสินค้ายืนยัน **เฉพาะ** `closed_success` · เสียงไม่บังคับทั้ง 2 outcome ·
 * จุดเริ่มเดินทางบังคับ **เฉพาะทีมที่คิดค่าน้ำมันโหมด `PER_KM`** (`DAILY_FLAT` ไม่ต้องเช็คเลย)
 *
 * คืน **รายการที่ขาดทั้งหมด** ไม่ใช่ตัวแรกที่เจอ — §20 บังคับว่าหน้าจอต้องบอกครบว่าขาดอะไรบ้าง
 */

export interface CloseEvidenceInput {
  /** null = ยังไม่เลือกผลการติดตาม (`41` §12 `CLOSE_OUTCOME_REQUIRED`) */
  outcome: CaseOutcome | null
  checkinCount: number
  photoCount: number
  videoCount: number
  productPhotoCount: number
  hasTravelOrigin: boolean
  /** โหมดค่าน้ำมันของทีมพนักงาน (`11` §7.1) — ไม่มีแผนค่าตอบแทนผูกไว้ = ไม่บังคับจุดเริ่มเดินทาง */
  fuelMode: FuelMode | null
}

/** ลำดับของรายการที่ขาด — เรียงตามลำดับ section บนฟอร์ม (`41` §7.6) เพื่อให้ข้อความอ่านเป็นธรรมชาติ */
export function missingCloseEvidence(input: CloseEvidenceInput): FieldErrorCode[] {
  const missing: FieldErrorCode[] = []

  if (input.outcome === null) missing.push('CLOSE_OUTCOME_REQUIRED')
  if (input.fuelMode === 'PER_KM' && !input.hasTravelOrigin) missing.push('CLOSE_TRAVEL_ORIGIN_REQUIRED')
  if (input.checkinCount < 1) missing.push('CLOSE_CHECKIN_REQUIRED')
  if (input.photoCount < 1) missing.push('CLOSE_PHOTO_REQUIRED')
  if (input.videoCount < 1) missing.push('CLOSE_VIDEO_REQUIRED')
  if (input.outcome === 'closed_success' && input.productPhotoCount < 1) missing.push('CLOSE_PRODUCT_PHOTO_REQUIRED')

  return missing
}

/**
 * โยน error ตัวแรกที่ขาด พร้อมแนบรายการที่ขาดทั้งหมดไว้ใน `context.missing`
 * (FE เอาไปแสดงเป็นรายการ "หลักฐานที่ยังขาด" ได้ครบในครั้งเดียว — `41` §20)
 */
export function assertCloseEvidence(input: CloseEvidenceInput): void {
  const missing = missingCloseEvidence(input)
  const first = missing[0]
  if (first === undefined) return
  throw new FieldError(first, { context: { missing } })
}

/**
 * `41` §10.1 — โหมด `needs_revision` แก้ได้เฉพาะสื่อ (รูป/วิดีโอ/เสียง/รูปสินค้า)
 * เช็คอิน + outcome ล็อกตามเดิม ส่วนจุดเริ่มเดินทางปรับได้ตามปกติ (ไม่ใช่หลักฐาน)
 */
export const REVISABLE_EVIDENCE_FIELDS = ['photos', 'videos', 'productPhotos', 'audioUrl'] as const
export type RevisableEvidenceField = (typeof REVISABLE_EVIDENCE_FIELDS)[number]

export interface EvidenceMediaSnapshot {
  photos: readonly string[]
  videos: readonly string[]
  productPhotos: readonly string[]
  audioUrl: string | null
}

/**
 * `41` §8 `resubmit_close_case` — ต้องมีการแก้ไขสื่ออย่างน้อย 1 รายการก่อนส่งกลับ
 * (เทียบชุดไฟล์ ไม่ใช่จำนวน — สลับไฟล์จำนวนเท่าเดิมก็ถือว่าแก้แล้ว)
 */
export function hasEvidenceRevision(before: EvidenceMediaSnapshot, after: EvidenceMediaSnapshot): boolean {
  const sameList = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index])

  return !(
    sameList(before.photos, after.photos) &&
    sameList(before.videos, after.videos) &&
    sameList(before.productPhotos, after.productPhotos) &&
    before.audioUrl === after.audioUrl
  )
}

/**
 * พิกัดต้องมาจาก device GPS จริง (`41` §11) — ค่าที่อยู่นอกช่วงพิกัดโลกหรือไม่ใช่ตัวเลข
 * แปลว่าไม่ได้มาจาก Geolocation API ⇒ ปฏิเสธด้วย `CHECKIN_GPS_PERMISSION_DENIED`
 *
 * ⚠️ ระบบ**ไม่มีช่องกรอกพิกัดมือ** — ตัวนี้เป็นยามชั้นสุดท้ายฝั่ง BE ไม่ใช่ตัวรับค่าจากฟอร์ม
 */
export function assertDeviceCoordinates(latitude: number, longitude: number): void {
  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)

  if (!valid) {
    throw new FieldError('CHECKIN_GPS_PERMISSION_DENIED', { context: { latitude, longitude } })
  }
}

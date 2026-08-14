import { hasEvidenceRevision, missingCloseEvidence, type EvidenceMediaSnapshot } from '@/lib/field/evidence'
import { fieldErrorMessage, type FieldErrorCode } from '@/lib/field/errors'
import type { CloseCaseInput, CloseDraftInput, ResubmitCloseInput, TravelOriginInput } from '@/lib/field/schemas'
import type { FieldCaseDetailDto } from '@/lib/field/types'
import type { CaseOutcome } from '@/lib/generated/prisma/enums'

/**
 * ตรรกะของ **ฟอร์มปิดงาน** (`41` §7.6) — **pure ล้วน** (แยกจาก JSX เพื่อให้เทสต์ได้
 * ตามแนวเดียวกับ `lib/cases/case-form.ts` ของ 2.4)
 *
 * กติกาที่บังคับที่นี่ (ต้องตรงกับฝั่ง API เป๊ะ — ตัวตัดสินจริงยังอยู่ที่ `evidence.ts` ตัวเดียวกัน):
 * - โหมดปกติ: เลือก outcome ก่อน แล้วจึงกรอกหลักฐาน · มีปุ่ม "บันทึก Draft" + "ยืนยันปิดงาน"
 * - โหมด `needs_revision` (§10.1): banner เหตุผลตีกลับค้างบนสุด · **outcome + เช็คอินล็อก**
 *   · แก้ได้เฉพาะสื่อ · ปุ่มเดียวคือ "ส่งกลับยืนยันอีกครั้ง" (ไม่มี Draft)
 * - กล่องจุดเริ่มเดินทางแสดง**เฉพาะทีม `PER_KM`** (§6.4.1) — ทีม `DAILY_FLAT` ไม่ต้องมีเลย
 */

export interface CloseFormState {
  outcome: CaseOutcome | null
  photos: string[]
  videos: string[]
  productPhotos: string[]
  audioUrl: string | null
  note: string | null
}

export const EMPTY_CLOSE_FORM: CloseFormState = {
  outcome: null,
  photos: [],
  videos: [],
  productPhotos: [],
  audioUrl: null,
  note: null,
}

/** ฟิลด์สื่อที่แก้ไขได้ในโหมด `needs_revision` (`41` §7.6) — คีย์ตรงกับ `CloseFormState` */
export const CLOSE_MEDIA_LISTS = ['photos', 'videos', 'productPhotos'] as const
export type CloseMediaList = (typeof CLOSE_MEDIA_LISTS)[number]

export function isRevisionMode(detail: Pick<FieldCaseDetailDto, 'status'>): boolean {
  return detail.status === 'needs_revision'
}

export interface CloseFormMode {
  /** ตีกลับหลักฐานอยู่ (`needs_revision`) — banner + ล็อก outcome/เช็คอิน */
  revision: boolean
  outcomeLocked: boolean
  checkinLocked: boolean
  /** โหมดตีกลับไม่มีปุ่มบันทึก Draft (เคสนี้ไม่ใช่งานที่ยังไม่เคยปิด — §7.6) */
  canSaveDraft: boolean
  /** กล่องจุดเริ่มเดินทาง — เฉพาะทีมที่คิดค่าน้ำมันโหมด `PER_KM` (§6.4.1) */
  showTravelOrigin: boolean
  submitLabel: string
}

export function closeFormMode(
  detail: Pick<FieldCaseDetailDto, 'status' | 'fuelMode'>,
): CloseFormMode {
  const revision = isRevisionMode(detail)
  return {
    revision,
    outcomeLocked: revision,
    // เช็คอินล็อก**ตลอด**อยู่แล้ว (พิกัด GPS จริง ณ เวลานั้น — §6.4) โหมดตีกลับแค่ซ่อนปุ่มเพิ่มด้วย
    checkinLocked: revision,
    canSaveDraft: !revision,
    showTravelOrigin: detail.fuelMode === 'PER_KM',
    submitLabel: revision ? 'ส่งกลับยืนยันอีกครั้ง' : 'ยืนยันปิดงาน',
  }
}

/**
 * ค่าเริ่มต้นของฟอร์มจากรายละเอียดเคส (`41` §6.5 draft autoload · §7.6 โหมดตีกลับ)
 *
 * - โหมดตีกลับ → ตั้งจาก **หลักฐานชุดที่ส่งไปแล้ว** (draft ถูกลบไปตอน submit สำเร็จแล้ว)
 * - โหมดปกติ → ตั้งจาก draft ที่ค้างไว้ ถ้าไม่มีก็ฟอร์มเปล่า
 */
export function closeFormFromDetail(detail: FieldCaseDetailDto): CloseFormState {
  if (isRevisionMode(detail) && detail.submittedEvidence !== null) {
    const evidence = detail.submittedEvidence
    return {
      outcome: evidence.outcome,
      photos: [...evidence.photos],
      videos: [...evidence.videos],
      productPhotos: [...evidence.productPhotos],
      audioUrl: evidence.audioUrl,
      note: null,
    }
  }

  const draft = detail.draft
  if (draft === null) return { ...EMPTY_CLOSE_FORM, photos: [], videos: [], productPhotos: [] }

  return {
    outcome: draft.outcome,
    photos: [...draft.photos],
    videos: [...draft.videos],
    productPhotos: [...draft.productPhotos],
    audioUrl: draft.audioUrl,
    note: draft.note,
  }
}

export function toMediaSnapshot(form: CloseFormState): EvidenceMediaSnapshot {
  return {
    photos: form.photos,
    videos: form.videos,
    productPhotos: form.productPhotos,
    audioUrl: form.audioUrl,
  }
}

/**
 * หลักฐานที่ยังขาดของฟอร์มนี้ — เรียก {@link missingCloseEvidence} ตัวเดียวกับที่ API บังคับ
 * (เช็คอิน/จุดเริ่มเดินทางอยู่ฝั่ง server แล้ว จึงนับจาก `detail` ไม่ใช่จาก state ของฟอร์ม)
 */
export function closeFormMissing(form: CloseFormState, detail: FieldCaseDetailDto): FieldErrorCode[] {
  return missingCloseEvidence({
    outcome: form.outcome,
    checkinCount: detail.checkins.length,
    photoCount: form.photos.length,
    videoCount: form.videos.length,
    productPhotoCount: form.productPhotos.length,
    hasTravelOrigin: detail.travelOrigin !== null,
    fuelMode: detail.fuelMode,
  })
}

/** ป้ายสั้น ๆ ของรายการที่ขาด — §20 บังคับว่าต้องบอก**ครบทุกอย่างในครั้งเดียว** */
const CLOSE_MISSING_LABEL: Readonly<Partial<Record<FieldErrorCode, string>>> = {
  CLOSE_OUTCOME_REQUIRED: 'ผลการติดตาม (สำเร็จ/ไม่สำเร็จ)',
  CLOSE_TRAVEL_ORIGIN_REQUIRED: 'จุดเริ่มเดินทาง',
  CLOSE_CHECKIN_REQUIRED: 'เช็คอินอย่างน้อย 1 จุด',
  CLOSE_PHOTO_REQUIRED: 'รูปถ่ายอย่างน้อย 1 รูป',
  CLOSE_VIDEO_REQUIRED: 'วิดีโออย่างน้อย 1 คลิป',
  CLOSE_PRODUCT_PHOTO_REQUIRED: 'รูปสินค้ายืนยันอย่างน้อย 1 รูป',
}

export function closeMissingLabel(code: FieldErrorCode): string {
  return CLOSE_MISSING_LABEL[code] ?? fieldErrorMessage(code).title
}

/** ข้อความรวมของรายการที่ขาด — คืน `null` เมื่อครบแล้ว */
export function closeMissingSummary(codes: readonly FieldErrorCode[]): string | null {
  if (codes.length === 0) return null
  return `ยังขาด: ${codes.map(closeMissingLabel).join(' · ')}`
}

/**
 * ในโหมดตีกลับต้องมีการแก้ไขสื่ออย่างน้อย 1 รายการก่อนส่งกลับ (`41` §8 `CLOSE_NO_EVIDENCE_REVISION`)
 * — เทียบกับชุดที่ส่งไปแล้ว ไม่ใช่กับ draft
 */
export function hasCloseFormRevision(form: CloseFormState, detail: FieldCaseDetailDto): boolean {
  if (detail.submittedEvidence === null) return false
  return hasEvidenceRevision(detail.submittedEvidence, toMediaSnapshot(form))
}

/** ปุ่มส่งกดได้ไหม — โหมดปกติ = หลักฐานครบ · โหมดตีกลับ = ต้องมีการแก้สื่อจริง */
export function canSubmitCloseForm(form: CloseFormState, detail: FieldCaseDetailDto): boolean {
  if (isRevisionMode(detail)) return hasCloseFormRevision(form, detail) && closeFormMissing(form, detail).length === 0
  return closeFormMissing(form, detail).length === 0
}

// ── payload ของแต่ละปุ่ม (`45` §6.3) ────────────────────────────────────────

function mediaPayload(form: CloseFormState) {
  return {
    photos: form.photos,
    videos: form.videos,
    productPhotos: form.productPhotos,
    audioUrl: form.audioUrl,
    note: form.note,
  }
}

/** `POST /api/field/cases/:id/close-draft` — ส่ง `travelOrigin` ไปด้วยเมื่อเพิ่งดึง/ปรับพิกัด */
export function closeDraftPayload(form: CloseFormState, travelOrigin?: TravelOriginInput): CloseDraftInput {
  return {
    outcome: form.outcome,
    ...mediaPayload(form),
    ...(travelOrigin === undefined ? {} : { travelOrigin }),
  }
}

/** `POST /api/field/cases/:id/close` */
export function closeCasePayload(form: CloseFormState): CloseCaseInput {
  return { outcome: form.outcome, ...mediaPayload(form) }
}

/** `POST /api/field/cases/:id/resubmit-close` — ไม่มี `outcome` โดยตั้งใจ (ล็อกตามรอบเดิม `41` §10.1) */
export function resubmitClosePayload(form: CloseFormState): ResubmitCloseInput {
  return mediaPayload(form)
}

// ── ตัวช่วยจัดการรายการสื่อ ─────────────────────────────────────────────────

export function appendMedia(list: readonly string[], added: readonly string[]): string[] {
  return [...list, ...added]
}

export function removeMediaAt(list: readonly string[], index: number): string[] {
  if (index < 0 || index >= list.length) return [...list]
  return list.filter((_, position) => position !== index)
}

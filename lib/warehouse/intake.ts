import type { ApiWarning } from '@/lib/api/envelope'
import type { AssetCondition } from '@/lib/generated/prisma/enums'
import { WarehouseError } from '@/lib/warehouse/errors'
import type { AssetIdentityComparison } from '@/lib/warehouse/imei'

/**
 * กติกาการรับเครื่องเข้าคลัง/ตีกลับ (`44` §8.2 · §10 · §12) — **pure ล้วน**
 * ฟอร์มฝั่ง client (2.14) เรียกตัว assert ชุดเดียวกับที่ API บังคับ — ห้ามเขียนเงื่อนไขซ้ำที่หน้าจอ
 */

/** 7 มุมที่ต้องถ่ายตอนรับเข้าคลัง (`44` §8.2 ขั้น 3/3) — ลำดับนี้ใช้เรียง input บนหน้าจอด้วย */
export const INTAKE_PHOTO_ANGLES = ['front', 'back', 'top', 'bottom', 'left', 'right', 'imei'] as const
export type IntakePhotoAngle = (typeof INTAKE_PHOTO_ANGLES)[number]

export const INTAKE_PHOTO_ANGLE_LABELS: Readonly<Record<IntakePhotoAngle, string>> = {
  front: 'ด้านหน้า',
  back: 'ด้านหลัง',
  top: 'ด้านบน',
  bottom: 'ด้านล่าง',
  left: 'ด้านซ้าย',
  right: 'ด้านขวา',
  imei: 'IMEI บนเครื่อง',
}

/**
 * ⚠️ จำนวนรูป **ไม่ใช่เงื่อนไข block** — `44` §12 ไม่มี code สำหรับ "รูปไม่ครบ" และ §16 ไม่ได้ระบุไว้
 *    (เครื่องบางสภาพถ่ายครบ 7 มุมไม่ได้จริง) หน้าจอเตือนได้ แต่ห้าม reject ที่ API
 */
export const INTAKE_PHOTO_TARGET_COUNT = INTAKE_PHOTO_ANGLES.length

/** สภาพที่ต้องกรอกรายละเอียดกำกับเสมอ (`44` §10 "Condition Note") */
const CONDITIONS_REQUIRING_NOTE: readonly AssetCondition[] = ['damaged', 'partial_loss']

export function requiresConditionNote(condition: AssetCondition | null): boolean {
  return condition !== null && CONDITIONS_REQUIRING_NOTE.includes(condition)
}

export interface IntakeConditionInput {
  condition: AssetCondition | null
  conditionNote: string | null
}

/**
 * `44` §12 — ไม่เลือกสภาพ = `INTAKE_MISSING_CONDITION` · ชำรุด/ขาดหายแต่ไม่มีรายละเอียด = `INTAKE_MISSING_NOTE`
 * (schema ปล่อย `null` ผ่านมาโดยตั้งใจ เพื่อให้ผู้ใช้เห็น code ของ `44` ไม่ใช่ `REQUIRED_MISSING`)
 */
export function assertIntakeCondition(input: IntakeConditionInput): void {
  if (input.condition === null) throw new WarehouseError('INTAKE_MISSING_CONDITION')
  if (requiresConditionNote(input.condition) && (input.conditionNote ?? '').trim() === '') {
    throw new WarehouseError('INTAKE_MISSING_NOTE', { context: { condition: input.condition } })
  }
}

/** `44` §10 "Reject Requires Reason" — คืนค่าที่ trim แล้วเพื่อให้ผู้เรียกเก็บลง DB ได้เลย */
export function assertRejectReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new WarehouseError('REJECT_MISSING_REASON')
  return trimmed
}

/**
 * คำเตือน IMEI/serial ไม่ตรง (`44` §12 `IMEI_MISMATCH`) — **เตือน ไม่ block** (Rule 04 · 1 ใน 5 code ทั้งระบบ)
 * คืน `undefined` เมื่อตรงครบ ⇒ ผู้เรียกไม่ต้องใส่ `warning` ลง envelope
 *
 * ข้อความบอก "ช่องไหนไม่ตรง" อย่างเดียว **ไม่ใส่ค่า IMEI ลงข้อความ** — ค่าเต็มทั้งสองฝั่งแสดงเทียบกัน
 * บนหน้าจออยู่แล้ว (§8.2 ขั้น 1/3) และ audit เก็บไว้ครบ
 */
export function imeiMismatchWarning(comparison: AssetIdentityComparison): ApiWarning | undefined {
  if (comparison.matched) return undefined
  const detail = comparison.comparable
    ? `ช่องที่ไม่ตรง: ${comparison.mismatchedFields.map(fieldLabel).join(' / ')}`
    : 'เคสนี้ไม่มีทั้ง IMEI และ serial ในสัญญา — ตรวจสอบข้อมูลเคสก่อนรับเข้าคลัง'
  return {
    code: 'IMEI_MISMATCH',
    title: IMEI_MISMATCH_WARNING.title,
    message: `${IMEI_MISMATCH_WARNING.message} (${detail})`,
  }
}

/**
 * ข้อความของ `IMEI_MISMATCH` — ไม่ได้อยู่ใน `lib/warehouse/errors.ts` เพราะเป็น warning ไม่ใช่ error
 * (ไม่มีวันถูก `throw`) แต่จงใจใช้รูปแบบ title/message เดียวกันเพื่อให้ข้อความบนหน้าจอสม่ำเสมอ
 */
export const IMEI_MISMATCH_WARNING = {
  title: 'IMEI ที่ตรวจจริงไม่ตรงกับสัญญา',
  message: 'ระบบบันทึกค่าที่ตรวจจริงไว้แล้วและรับเข้าคลังต่อได้ — แนะนำให้ตีกลับถ้าไม่มั่นใจ',
} as const

function fieldLabel(field: AssetIdentityComparison['mismatchedFields'][number]): string {
  return field === 'imei' ? 'IMEI' : 'Serial'
}

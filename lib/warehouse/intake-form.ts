import type { AssetCondition } from '@/lib/generated/prisma/enums'
import { WarehouseError } from '@/lib/warehouse/errors'
import { IMEI_FORMAT_MESSAGE, parseImei, type AssetIdentityContract } from '@/lib/warehouse/imei'
import { assertIntakeCondition, assertIntakeIdentity } from '@/lib/warehouse/intake'
import { COLOR_CAPACITY_CHOICE_REQUIRED_MESSAGE, COLOR_CAPACITY_NOTE_REQUIRED_MESSAGE } from '@/lib/warehouse/schemas'

/**
 * ตรวจฟอร์ม "รับเข้าคลัง" ฝั่งหน้าจอ — **pure ล้วน** (ตรวจ a11y staging SV5-B2-01)
 *
 * ตรวจทุกช่อง/กลุ่มบังคับในรอบเดียวแล้วคืนข้อผิดแยกตามช่อง ⇒ หน้าจอแสดงใต้ช่องของมันพร้อมกัน
 * (`<Field error>` + aria-invalid) แล้วโฟกัสช่องแรกตามลำดับบนจอ — ไม่ใช่กล่องแจ้งเตือนบนสุด
 * ใช้ตัว assert ชุดเดียวกับ API (`assertIntakeIdentity` · `assertIntakeCondition`) — ห้ามเขียนเงื่อนไขซ้ำ
 * ⚠️ WarehouseError ที่ไม่ใช่ข้อผิดของช่อง (ไม่มีในปัจจุบัน) ถูกโยนต่อให้ผู้เรียกแสดงเป็นกล่องแจ้งเตือน
 */

export interface IntakeFieldErrors {
  imei?: string
  serial?: string
  colorCapacity?: string
  colorCapacityNote?: string
  condition?: string
  conditionNote?: string
}

export interface IntakeFormInput {
  contract: AssetIdentityContract
  /** ค่าดิบในช่อง (ยังไม่ผ่าน `parseImei()`) */
  imeiActual: string
  serialActual: string
  colorCapacityMatched: boolean | null
  colorCapacityNote: string
  condition: AssetCondition | null
  conditionNote: string
}

/** ยังไม่กรอก Serial ในเคสที่บังคับ Serial (สัญญาไม่มี IMEI) — ข้อความของ `REQUIRED_MISSING` พูดถึง IMEI จึงไม่เหมาะใต้ช่อง Serial */
export const SERIAL_ACTUAL_REQUIRED_MESSAGE = 'ต้องกรอก Serial ที่ตรวจจริงบนเครื่องก่อนยืนยันรับเข้าคลัง'

export function collectIntakeFieldErrors(input: IntakeFormInput): IntakeFieldErrors {
  const errors: IntakeFieldErrors = {}
  const imeiRaw = input.imeiActual.trim()
  const serial = input.serialActual.trim()
  const imeiNormalized = parseImei(input.imeiActual)

  // ขั้น 1/3 — รูปแบบ IMEI ผิด (มติ PO U24) · ไม่กรอกค่าที่ตรวจจริง = REQUIRED_MISSING ของช่องที่บังคับ
  // ตรวจช่องบังคับทุกครั้ง (แม้ IMEI รูปแบบผิด) ⇒ เคสบังคับ Serial เห็นข้อผิด Serial ในรอบเดียวกัน
  if (imeiRaw !== '' && imeiNormalized === null) errors.imei = IMEI_FORMAT_MESSAGE
  try {
    assertIntakeIdentity(input.contract, {
      imeiActual: imeiNormalized ?? (imeiRaw === '' ? null : imeiRaw),
      serialActual: serial === '' ? null : serial,
    })
  } catch (error) {
    if (!(error instanceof WarehouseError) || error.code !== 'REQUIRED_MISSING') throw error
    if (error.context?.field === 'serialActual') errors.serial = SERIAL_ACTUAL_REQUIRED_MESSAGE
    else errors.imei = error.userMessage
  }

  // ขั้น 1/3 — สี/ความจุ (มติ O77 ตัวเลือกบังคับ) · ไม่ตรง ⇒ ต้องระบุสิ่งที่พบ
  if (input.colorCapacityMatched === null) errors.colorCapacity = COLOR_CAPACITY_CHOICE_REQUIRED_MESSAGE
  else if (!input.colorCapacityMatched && input.colorCapacityNote.trim() === '') {
    errors.colorCapacityNote = COLOR_CAPACITY_NOTE_REQUIRED_MESSAGE
  }

  // ขั้น 2/3 — ข้อความตาม code ของคลัง (INTAKE_MISSING_CONDITION / INTAKE_MISSING_NOTE) ไม่ใช่ REQUIRED_MISSING
  try {
    assertIntakeCondition({
      condition: input.condition,
      conditionNote: input.conditionNote.trim() === '' ? null : input.conditionNote,
    })
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error
    if (error.code === 'INTAKE_MISSING_NOTE') errors.conditionNote = error.userMessage
    else if (error.code === 'INTAKE_MISSING_CONDITION') errors.condition = error.userMessage
    else throw error
  }

  return errors
}

export function hasIntakeFieldErrors(errors: IntakeFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}

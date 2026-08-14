import { z } from 'zod'

/**
 * ชิ้นส่วน Zod ที่ใช้ร่วมทุกโมดูล (Rule 04 · Rule 13 — schema เดียวใช้ร่วม FE/BE)
 * ย้ายออกมาจาก `lib/roles/schemas.ts` (Phase 1.6) ตอน Phase 1.7 เพื่อไม่ให้แต่ละโมดูลนิยามซ้ำ
 *
 * TODO(Phase 2.1): รวมเข้ากับ envelope/validation กลางของไฟล์ `45` เมื่อ API Contract Infra พร้อม
 */

const REASON_MIN = 5
const REASON_MAX = 500

/** `reason` ของ mutation ที่กระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period (`90` §13) */
export const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, `กรุณาระบุเหตุผลอย่างน้อย ${REASON_MIN} ตัวอักษร`)
  .max(REASON_MAX, `เหตุผลยาวเกิน ${REASON_MAX} ตัวอักษร`)

/** เพดานเงินต่อช่อง 1,000,000,000 สตางค์ = 10 ล้านบาท — กันพิมพ์ผิดหลักจนล้น INTEGER */
export const MAX_SATANG = 1_000_000_000

/**
 * เงิน = **INTEGER satang เท่านั้น** (Rule 01) — ทศนิยม/ค่าติดลบถูกปฏิเสธที่ชั้น schema
 * ห้ามรับบาทแล้วคูณ 100 ที่ backend: FE แปลงเป็นสตางค์ก่อนส่งเสมอ
 */
export function satangSchema(label: string) {
  return z
    .number({ message: `${label} ต้องเป็นตัวเลข` })
    .int(`${label} ต้องเป็นจำนวนเต็มสตางค์ (ห้ามมีทศนิยม)`)
    .min(0, `${label} ต้องไม่ติดลบ`)
    .max(MAX_SATANG, `${label} เกินเพดานที่ระบบรับได้`)
}

/** เปอร์เซ็นต์ = NUMERIC(5,2) — ข้อยกเว้นเดียวของกฎ "เงินเป็น INTEGER" (`02` §2.2) */
export function pctSchema(label: string, max = 100) {
  return z
    .number({ message: `${label} ต้องเป็นตัวเลข` })
    .min(0, `${label} ต้องอยู่ระหว่าง 0-${max}`)
    .max(max, `${label} ต้องอยู่ระหว่าง 0-${max}`)
    .refine((value) => Number.isInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
      message: `${label} มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`,
    })
}

/** แปลง Zod error → field errors สำหรับ response 400 (`24` §6.1 `REQUIRED_MISSING`) */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_'
    if (fields[path] === undefined) fields[path] = issue.message
  }
  return fields
}

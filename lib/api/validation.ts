import { z } from 'zod'

/**
 * ชิ้นส่วน Zod ที่ใช้ร่วมทุกโมดูล (Rule 04 · Rule 13 — schema เดียวใช้ร่วม FE/BE)
 * ย้ายออกมาจาก `lib/roles/schemas.ts` (Phase 1.6) ตอน Phase 1.7 เพื่อไม่ให้แต่ละโมดูลนิยามซ้ำ
 *
 * `toFieldErrors()` ป้อนช่อง `error.fields` ของ envelope กลาง (`lib/api/envelope.ts` — Phase 2.1)
 */

const REASON_MIN = 5
const REASON_MAX = 500

/** `reason` ของ mutation ที่กระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period (`90` §13) */
export const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, `กรุณาระบุเหตุผลอย่างน้อย ${REASON_MIN} ตัวอักษร`)
  .max(REASON_MAX, `เหตุผลยาวเกิน ${REASON_MAX} ตัวอักษร`)

/**
 * รหัสอ้างอิง (UUID) ของ **dropdown บังคับเลือก** — ยังไม่เลือก (FE ส่ง `undefined`/`''`) ต้องได้
 * "กรุณาเลือก…" เป็นภาษาไทย ไม่ใช่ข้อความดิบของ Zod "Invalid input: expected string, received undefined"
 * หรือ "รูปแบบรหัสไม่ถูกต้อง" ที่ทำให้ผู้ใช้งง (UAT BUG-003/BUG-017) · ค่าที่มีแต่ไม่ใช่ UUID ยังได้ข้อความรูปแบบเดิม
 *
 * ใช้ `.guid()` (8-4-4-4-12 hex เท่ากับที่ Postgres `uuid` รับ) ไม่ใช่ `.uuid()` ของ Zod 4 ที่บังคับ version RFC
 * ⇒ id จาก seed แบบ `00000000-0000-0000-0000-000000000001` ผ่านได้ (BUG-173 — ทั้ง repo ใช้ guid ทั้งหมด)
 *
 * `label` = ชื่อช่องตามที่ผู้ใช้เห็น เช่น `requiredIdSchema('บทบาท')` → "กรุณาเลือกบทบาท"
 */
export function requiredIdSchema(label: string) {
  const required = `กรุณาเลือก${label}`
  return z
    .string({ error: () => required })
    .min(1, required)
    .guid('รูปแบบรหัสไม่ถูกต้อง')
}

/** เพดานเงินต่อช่อง 1,000,000,000 สตางค์ = 10 ล้านบาท — กันพิมพ์ผิดหลักจนล้น INTEGER */
export const MAX_SATANG = 1_000_000_000

/**
 * เงิน = **INTEGER satang เท่านั้น** (Rule 01) — ทศนิยม/ค่าติดลบถูกปฏิเสธที่ชั้น schema
 * ห้ามรับบาทแล้วคูณ 100 ที่ backend: FE แปลงเป็นสตางค์ก่อนส่งเสมอ
 */
export function satangSchema(label: string) {
  return z
    // NaN มาจาก `parseBahtInput()` เมื่อกรอกตัวอักษรหรือทศนิยมเกิน 2 ตำแหน่ง (UAT BUG-007) — บอกทั้งสองเหตุ
    .number({ message: `${label} ต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง` })
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

const INPUT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * ช่องวันที่แบบ **date-only** (คอลัมน์ `DATE` ไม่ใช่ `TIMESTAMPTZ`) — รับ `YYYY-MM-DD` ค.ศ. จาก
 * `<input type="date">` (ข้อยกเว้นเดียวของ Rule 01) แล้วแปลงเป็น **เที่ยงคืน UTC** ของวันนั้น
 *
 * ⚠️ ห้ามใช้ `fromInputDate()` กับคอลัมน์ `DATE`: ตัวนั้นแปลงเป็นเที่ยงคืน**ตามเวลาไทย** (= 17:00Z
 * ของวันก่อนหน้า) ซึ่ง Prisma จะตัดเก็บเป็นวันที่ผิดไป 1 วัน · `fromInputDate()` ใช้กับ instant
 * (`TIMESTAMPTZ`) เท่านั้น
 */
export function dateOnlySchema(label: string) {
  return z
    .string()
    .regex(INPUT_DATE_PATTERN, `${label} ต้องเป็นรูปแบบ YYYY-MM-DD`)
    .transform((value, ctx) => {
      const parts = value.split('-').map((part) => Number.parseInt(part, 10))
      const [year = 0, month = 0, day = 0] = parts
      const date = new Date(Date.UTC(year, month - 1, day))
      if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        ctx.addIssue({ code: 'custom', message: `${label} ไม่ใช่วันที่ที่มีอยู่จริง` })
        return z.NEVER
      }
      return date
    })
}

/** แปลง Zod error → field errors สำหรับ response 400 (`24` §6.1 `REQUIRED_MISSING`) */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_'
    if (fields[path] === undefined) fields[path] = userFacingIssueMessage(issue)
  }
  return fields
}

const THAI_CHAR = /[\u0E00-\u0E7F]/

/**
 * ข้อความ field ที่ผู้ใช้เห็นต้องเป็นภาษาไทยเสมอ (UAT BUG-122) — schema ส่วนใหญ่ตั้งข้อความไทยเองแล้ว
 * แต่กรณีที่ Zod สร้างข้อความเอง (เช่น ไม่ส่ง key มาเลย → "Invalid input: expected string, received
 * undefined") จะหลุดเป็นอังกฤษดิบ ⇒ ข้อความที่ไม่มีอักษรไทยแปลงเป็นข้อความไทยตามชนิด issue ที่นี่จุดเดียว
 */
export function userFacingIssueMessage(issue: z.core.$ZodIssue): string {
  if (THAI_CHAR.test(issue.message)) return issue.message
  switch (issue.code) {
    case 'invalid_type':
      // Zod 4 ไม่แนบ `input` มากับ issue โดยปริยาย — ดูจากข้อความ default "…, received undefined"
      return /received (undefined|null)/.test(issue.message) ? 'กรุณาระบุข้อมูลช่องนี้' : 'รูปแบบข้อมูลไม่ถูกต้อง'
    case 'too_small':
      if (issue.origin === 'string') {
        return Number(issue.minimum) <= 1 ? 'กรุณาระบุข้อมูลช่องนี้' : `ต้องมีอย่างน้อย ${String(issue.minimum)} ตัวอักษร`
      }
      if (issue.origin === 'array' || issue.origin === 'set') return `ต้องเลือกอย่างน้อย ${String(issue.minimum)} รายการ`
      return `ค่าต้องไม่น้อยกว่า ${String(issue.minimum)}`
    case 'too_big':
      if (issue.origin === 'string') return `ยาวเกิน ${String(issue.maximum)} ตัวอักษร`
      if (issue.origin === 'array' || issue.origin === 'set') return `เลือกได้ไม่เกิน ${String(issue.maximum)} รายการ`
      return `ค่าต้องไม่เกิน ${String(issue.maximum)}`
    case 'invalid_format':
      return 'รูปแบบข้อมูลไม่ถูกต้อง'
    case 'invalid_value':
      return 'ค่าที่เลือกไม่อยู่ในตัวเลือกที่ระบบรองรับ'
    case 'unrecognized_keys':
      return 'มีข้อมูลที่ระบบไม่รู้จักปนมา'
    default:
      return 'ข้อมูลไม่ถูกต้อง'
  }
}

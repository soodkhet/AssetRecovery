/**
 * รูปแบบ + การเปรียบเทียบตัวตนของเครื่อง (`44` §6.5 · §10) — **pure ล้วน** · จุดเดียวของทั้งระบบ
 *
 * ### กติกาที่ห้ามละเมิด (มติ PO 05/10/2569 U24 · BUG-078)
 * - **รับเข้า**: ตัดเฉพาะตัวคั่น **ช่องว่าง / ขีด (-) / จุด (.)** ทุกตำแหน่ง ด้วย `parseImei()` เท่านั้น
 *   → ต้องเหลือตัวเลขล้วน **15 หลักพอดี** · มีตัวอักษร/อักขระอื่น หรือไม่ครบ/เกิน 15 หลัก = **ปฏิเสธ**
 *   (ห้ามตัดทิ้งเงียบ ๆ) · ไม่ fuzzy ไม่ตรวจ Luhn · ทุกช่องทางที่รับ IMEI (ส่งเคส/นำเข้า/รับเข้าคลัง)
 *   ต้องผ่านตัวนี้ ⇒ DB เก็บเป็นตัวเลข 15 หลักล้วนเสมอ
 * - **เทียบ**: exact match ทุกหลักบนค่าที่ normalize แล้ว — ต่างกัน 1 หลัก = ไม่ตรง ⇒ `identityMatches()`
 *   ใช้ `===` ตรง ๆ (ห้าม normalize ซ้ำ/fuzzy ที่จุดเทียบ — ค่าเข้ามาสะอาดแล้วจากชั้นรับเข้า)
 * - เครื่องที่ไม่มี IMEI (แท็บเล็ต Wi-Fi ฯลฯ) เทียบด้วย `serial` แทน (A6 · `02` `Case.serialNo`)
 * - ไม่ตรง = **เตือน ไม่ block** (`44` §12 `IMEI_MISMATCH`) — ธุรการยืนยันรับต่อได้ แต่ค่าที่ตรวจจริง
 *   ต้องถูกบันทึกไว้เสมอเพื่อให้ตามสอบได้ (ตัวเขียนอยู่ `lib/warehouse/queries.ts`)
 */

import { z } from 'zod'

/** IMEI ตามมาตรฐาน = ตัวเลข 15 หลักพอดี (`44` §6.5) */
export const IMEI_LENGTH = 15

const IMEI_PATTERN = /^\d{15}$/

/** ตัวคั่นที่ยอมตัดได้ — ช่องว่าง (รวม tab/ช่องว่างไม่ตัดบรรทัดจากการวาง) · ขีด · จุด — **เท่านั้น** */
const IMEI_SEPARATORS = /[\s.-]/g

/** มีตัวอักษร (ภาษาใดก็ได้) ⇒ ช่องรวม "IMEI หรือ Serial" ถือเป็น serial ไม่ใช่ความพยายามกรอก IMEI */
const HAS_LETTER = /\p{L}/u

/** ความยาวช่องกรอก IMEI บนฟอร์ม — เผื่อตัวคั่น (เช่น `35 693803 564380 9`) ความยาวจริงตรวจที่ `parseImei()` */
export const IMEI_INPUT_MAX_LENGTH = 30

/** ข้อความเมื่อรูปแบบ IMEI ผิด — ใช้ร่วม FE/BE (Zod + ฟอร์ม) */
export const IMEI_FORMAT_MESSAGE = `IMEI ต้องเป็นตัวเลข ${IMEI_LENGTH} หลัก (เว้นวรรค ขีด หรือจุดคั่นได้)`

/**
 * แปลง IMEI ที่ผู้ใช้กรอก/นำเข้าเป็นตัวเลข 15 หลักล้วน — คืน `null` เมื่อรูปแบบผิด (ผู้เรียกต้องปฏิเสธ)
 *
 * ตัดเฉพาะช่องว่าง/ขีด/จุด ทุกตำแหน่ง แล้วต้องเหลือ `^\d{15}$` พอดี — อักขระอื่น (`/`, ตัวอักษร `O` ฯลฯ)
 * ไม่ถูกตัด จึงไม่ผ่านเสมอ
 */
export function parseImei(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const stripped = value.replace(IMEI_SEPARATORS, '')
  return IMEI_PATTERN.test(stripped) ? stripped : null
}

/**
 * Zod ของช่อง IMEI ล้วน (ใช้ร่วม FE/BE) — แปลงเป็นตัวเลข 15 หลักด้วย `parseImei()` ไม่ผ่าน = field error
 * (API ตอบ `API_VALIDATION_FAILED` 400 พร้อมข้อความรูปแบบ) · ว่าง/ช่องว่างล้วน = `null`
 */
export const imeiInputSchema = z
  .string()
  .nullish()
  .transform((value, ctx) => {
    if (value === null || value === undefined || value.trim() === '') return null
    const imei = parseImei(value)
    if (imei === null) {
      ctx.addIssue({ code: 'custom', message: IMEI_FORMAT_MESSAGE })
      return z.NEVER
    }
    return imei
  })

/**
 * คีย์ค้น IMEI แบบ exact — คำค้นที่เป็น IMEI มีตัวคั่น (เช่น `35-693803-564380-9`) ⇒ ใช้ค่าที่ normalize แล้ว
 * ไม่ใช่ IMEI = คืนคำค้นเดิม (trim) ให้เทียบ exact ตามปกติ · ไม่ fuzzy
 */
export function imeiSearchKey(keyword: string): string {
  return parseImei(keyword) ?? keyword.trim()
}

/**
 * ค่าในช่องรวม "IMEI หรือ Serial Number" (`38` §6.2) ถือเป็นความพยายามกรอก IMEI หรือไม่
 * — ไม่มีตัวอักษรเลย (มีแต่ตัวเลข/สัญลักษณ์) = IMEI ⇒ ต้องผ่าน `parseImei()` · มีตัวอักษร = serial
 */
export function isImeiLikeIdentifier(value: string): boolean {
  return value.trim() !== '' && !HAS_LETTER.test(value)
}

/** ตัวอักษรที่มักถูกพิมพ์แทนตัวเลข: O/o→0 · I/l→1 · S→5 · B→8 · Z→2 (มติ PO U54) */
const IMEI_LOOKALIKE_LETTER = /^[OoIlSBZ]$/
const DIGIT = /^\d$/

/** ข้อความเตือน (ไม่บล็อก) เมื่อค่าที่ถูกจัดเป็น Serial ดูเหมือน IMEI ที่พิมพ์ผิด (มติ PO U54) */
export const IMEI_TYPO_WARNING_MESSAGE = 'ดูเหมือน IMEI ที่มีตัวอักษรปน — ตรวจอีกครั้ง'

/**
 * ค่าในช่อง "IMEI หรือ Serial" ที่ถูกจัดเป็น **Serial** แต่ดูเหมือน IMEI พิมพ์ผิดหรือไม่ (มติ PO U54) — **เตือน ไม่บล็อก**
 * เกณฑ์: มีตัวอักษร (จึงเป็น Serial) · ตัดตัวคั่นชุดเดียวกับ `parseImei()` แล้วเหลือ 15 ตัวพอดี ·
 * เป็นตัวเลข 13–14 ตัว + ตัวอักษรที่สับสนกับตัวเลข (O/o/I/l/S/B/Z) 1–2 ตัว — ไม่ fuzzy แก้ค่าให้ (ยังบันทึกเป็น Serial ตามที่กรอก)
 */
export function looksLikeMistypedImei(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '' || isImeiLikeIdentifier(trimmed)) return false
  const chars = [...trimmed.replace(IMEI_SEPARATORS, '')]
  if (chars.length !== IMEI_LENGTH) return false
  let digits = 0
  for (const char of chars) {
    if (DIGIT.test(char)) digits += 1
    else if (!IMEI_LOOKALIKE_LETTER.test(char)) return false
  }
  return digits >= IMEI_LENGTH - 2 && digits <= IMEI_LENGTH - 1
}

/** ข้อความเตือนของช่อง "IMEI หรือ Serial" — `null` = ไม่มีอะไรต้องเตือน (ใช้ร่วมฟอร์ม/นำเข้าไฟล์/API) */
export function assetIdentifierWarning(value: string | null | undefined): string | null {
  return looksLikeMistypedImei(value) ? IMEI_TYPO_WARNING_MESSAGE : null
}

export type AssetIdentityField = 'imei' | 'serial'

export interface AssetIdentityContract {
  imeiContract: string | null
  serialContract: string | null
}

export interface AssetIdentityActual {
  imeiActual: string | null
  serialActual: string | null
}

export interface AssetIdentityFieldComparison {
  field: AssetIdentityField
  contract: string
  /** `null` = ธุรการยังไม่กรอกค่าที่ตรวจจริงของช่องนี้ ⇒ ยืนยันไม่ได้ว่าตรง = ถือว่าไม่ตรง */
  actual: string | null
  matched: boolean
}

export interface AssetIdentityComparison {
  /** ตรงทุกช่องที่มีค่าในสัญญาให้เทียบ (และต้องมีอย่างน้อย 1 ช่อง) */
  matched: boolean
  /** เคสข้อมูลผิดปกติ: สัญญาไม่มีทั้ง IMEI และ serial ⇒ ไม่มีอะไรให้เทียบ (ต้องเตือนเสมอ) */
  comparable: boolean
  fields: readonly AssetIdentityFieldComparison[]
  mismatchedFields: readonly AssetIdentityField[]
}

/**
 * ค่าที่ **normalize แล้ว** เป็น IMEI 15 หลักล้วนไหม (ตรวจค่าที่เก็บ/ค่าหลัง `parseImei()`)
 * ค่าที่ผู้ใช้กรอกสด ๆ ให้ใช้ `parseImei()` แทน
 */
export function isValidImei(value: string | null | undefined): boolean {
  return typeof value === 'string' && IMEI_PATTERN.test(value)
}

/** เทียบค่าเดี่ยวแบบ exact — ค่าใดว่าง = ไม่ตรง (ค่าต้อง normalize มาจากชั้นรับเข้าแล้ว ห้าม fuzzy ที่นี่ · `44` §6.5) */
export function identityMatches(contract: string | null, actual: string | null): boolean {
  if (contract === null || actual === null) return false
  return contract === actual
}

/**
 * เทียบตัวตนเครื่องที่ตรวจจริงกับที่ระบุในสัญญา
 *
 * เทียบเฉพาะช่องที่ **สัญญามีค่า** — เครื่องที่สัญญาระบุแต่ IMEI จะไม่ถูกตัดสินจาก serial ที่ธุรการ
 * กรอกเพิ่ม (และกลับกัน) เพื่อไม่ให้ข้อมูลเสริมทำให้ผลการเทียบเพี้ยน
 */
export function compareAssetIdentity(
  contract: AssetIdentityContract,
  actual: AssetIdentityActual,
): AssetIdentityComparison {
  const fields: AssetIdentityFieldComparison[] = []

  if (contract.imeiContract !== null) {
    fields.push({
      field: 'imei',
      contract: contract.imeiContract,
      actual: actual.imeiActual,
      matched: identityMatches(contract.imeiContract, actual.imeiActual),
    })
  }
  if (contract.serialContract !== null) {
    fields.push({
      field: 'serial',
      contract: contract.serialContract,
      actual: actual.serialActual,
      matched: identityMatches(contract.serialContract, actual.serialActual),
    })
  }

  const mismatchedFields = fields.filter((entry) => !entry.matched).map((entry) => entry.field)
  return {
    matched: fields.length > 0 && mismatchedFields.length === 0,
    comparable: fields.length > 0,
    fields,
    mismatchedFields,
  }
}

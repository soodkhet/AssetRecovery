/**
 * เปรียบเทียบตัวตนของเครื่อง (`44` §6.5 · §10) — **pure ล้วน**
 *
 * ### กติกาที่ห้ามละเมิด
 * - **exact match 15 หลักเท่านั้น** — ห้าม trim, ห้าม ignore dash, ห้าม uppercase, ห้าม fuzzy
 *   ต่างกัน 1 หลัก = ไม่ตรง (`44` §6.5) ⇒ ที่นี่ใช้ `===` ตรง ๆ **ห้าม** ใส่ normalize เพิ่มเด็ดขาด
 * - เครื่องที่ไม่มี IMEI (แท็บเล็ต Wi-Fi ฯลฯ) เทียบด้วย `serial` แทน (A6 · `02` `Case.serialNo`)
 * - ไม่ตรง = **เตือน ไม่ block** (`44` §12 `IMEI_MISMATCH`) — ธุรการยืนยันรับต่อได้ แต่ค่าที่ตรวจจริง
 *   ต้องถูกบันทึกไว้เสมอเพื่อให้ตามสอบได้ (ตัวเขียนอยู่ `lib/warehouse/queries.ts`)
 */

/** IMEI ตามมาตรฐาน = ตัวเลข 15 หลักพอดี (`44` §6.5) */
export const IMEI_LENGTH = 15

const IMEI_PATTERN = /^\d{15}$/

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

/** รูปแบบ IMEI ถูกต้องไหม (ใช้ตอน validate ฟอร์ม — **ไม่**เกี่ยวกับการตัดสินว่าตรงกับสัญญาหรือไม่) */
export function isValidImei(value: string | null | undefined): boolean {
  return typeof value === 'string' && IMEI_PATTERN.test(value)
}

/** เทียบค่าเดี่ยวแบบ exact — ค่าใดว่าง = ไม่ตรง (ห้าม normalize ก่อนเทียบ · `44` §6.5) */
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

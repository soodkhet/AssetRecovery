/**
 * ความจุ + สีของเครื่องตามสัญญา (มติ PO U166 · `38` §6.2) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * เก็บบนเคสเป็น**ข้อความ snapshot** (`cases.asset_capacity` / `cases.asset_color`) — แก้รายการตัวเลือกภายหลังไม่กระทบเคสเดิม
 * ตัวเลือก = รายการมาตรฐาน (ผู้ดูแลแก้ได้ในหน้า Model Phone) + "ระบุเอง" (พิมพ์ข้อความ) + "ไม่ระบุในสัญญา"
 * **บังคับเลือกก่อนส่งตรวจ** (ร่างเว้นได้ — ตัวบังคับอยู่ที่ `missingRequiredFields()`)
 */

export const DEFAULT_CAPACITY_OPTIONS: readonly string[] = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB']

export const DEFAULT_COLOR_OPTIONS: readonly string[] = [
  'ดำ',
  'ขาว',
  'เงิน',
  'เทา',
  'ทอง',
  'น้ำเงิน',
  'ฟ้า',
  'เขียว',
  'ม่วง',
  'ชมพู',
  'แดง',
  'ส้ม',
  'เหลือง',
]

/** ค่าที่เลือกได้เสมอ — สัญญาไม่ได้ระบุความจุ/สี (นับว่า "เลือกแล้ว") */
export const NOT_SPECIFIED_IN_CONTRACT = 'ไม่ระบุในสัญญา'

/** จำนวนวันที่ไฟล์ TAC บน GitHub ไม่ถูกแก้แล้วขึ้นป้าย "แหล่งข้อมูลอาจหยุดอัปเดต" (มติ PO U167) */
export const DEFAULT_STALE_ALERT_DAYS = 90
export const MIN_STALE_ALERT_DAYS = 1
export const MAX_STALE_ALERT_DAYS = 3650

export const MAX_ATTRIBUTE_OPTIONS = 50
export const MAX_ATTRIBUTE_LENGTH = 50

/** ตัดช่องว่าง/ซ้ำ (ไม่สนตัวพิมพ์) คงลำดับเดิม · ตัด "ไม่ระบุในสัญญา" ออก (ระบบใส่ให้เสมอ) */
export function cleanAttributeOptions(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    // NFC (ไม่ใช่ NFKC — NFKC แตกสระอำของไทยเป็น ํ + า)
    const value = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
    const key = value.toLowerCase()
    if (value === '' || key === NOT_SPECIFIED_IN_CONTRACT.toLowerCase() || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

/** ข้อความหลายบรรทัด/คั่นจุลภาค → รายการตัวเลือก (ฟอร์มตั้งค่า) */
export function parseAttributeOptionsText(text: string): string[] {
  return cleanAttributeOptions(text.split(/[\n,]+/))
}

/** ค่าในช่องความจุ/สีของฟอร์ม → โหมดของ dropdown (ค่ามาตรฐาน / ไม่ระบุในสัญญา / ระบุเอง / ยังไม่เลือก) */
export type AttributeChoice =
  | { kind: 'empty' }
  | { kind: 'option'; value: string }
  | { kind: 'not_specified' }
  | { kind: 'custom'; value: string }

export function attributeChoiceOf(value: string | null | undefined, options: readonly string[]): AttributeChoice {
  const text = (value ?? '').trim()
  if (text === '') return { kind: 'empty' }
  if (text === NOT_SPECIFIED_IN_CONTRACT) return { kind: 'not_specified' }
  const match = options.find((option) => option.toLowerCase() === text.toLowerCase())
  return match === undefined ? { kind: 'custom', value: text } : { kind: 'option', value: match }
}

/**
 * ความจุจากข้อความนำเข้า ("128 gb" · "128G" · "1tb") → รูปมาตรฐาน ("128GB" · "1TB") · ไม่เข้ารูปแบบ = ข้อความเดิม (ตัดช่องว่าง)
 */
export function normalizeCapacityText(value: string | null | undefined): string | null {
  const text = (value ?? '').normalize('NFC').trim()
  if (text === '') return null
  const match = /^(\d{1,4})\s*(g|gb|t|tb)$/i.exec(text)
  if (match === null) return text
  const unit = (match[2] ?? '').toLowerCase().startsWith('t') ? 'TB' : 'GB'
  return `${Number(match[1])}${unit}`
}

/** ข้อความแสดงบนหน้าจอ/PDF — ยังไม่มีค่า (เคสเก่าก่อนมติ) = "—" */
export function deviceAttributesText(capacity: string | null | undefined, color: string | null | undefined): string {
  const parts = [capacity, color].map((value) => (value ?? '').trim()).filter((value) => value !== '')
  return parts.length === 0 ? '—' : parts.join(' · ')
}

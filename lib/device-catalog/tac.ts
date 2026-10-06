import { DEFAULT_FILTER_BRANDS, cleanCatalogName, normalizeCatalogName } from '@/lib/device-catalog/catalog'

/**
 * ฐาน TAC (Type Allocation Code — 8 หลักแรกของ IMEI) → ยี่ห้อ/รุ่น (มติ PO U166 · DEC-017 · `13` §6.18)
 * **pure ล้วน** ใช้ร่วม FE/BE — ห้าม import อะไรที่แตะ DB/เครือข่าย
 *
 * แหล่ง: ไฟล์ `tac_full.csv` ของ repo สาธารณะ `MoazEb/tac-database` (MIT) — คอลัมน์ `Brand,TAC,SPECS`
 * - `TAC` เป็นตัวเลข — บางแถวเลข 0 นำหน้าหายไป (7 หลัก) ⇒ เติม 0 ด้านหน้าให้ครบ 8 หลัก
 * - `SPECS` = ข้อความหลายส่วนคั่นด้วย `", "` (วงเล็บอาจมีจุลภาคข้างใน เช่น `(UK, EU, ZA)`) รูปแบบที่พบจริง:
 *   - `"SAMSUNG GALAXY A54 5G, Samsung SM-A546E/DS2023"` — ชื่อ + "ผู้ผลิต รหัสรุ่น" (**ปีติดท้ายรหัสรุ่น**)
 *   - `"APPLE IPHONE 14, Apple iPhone 14, A2882, 2022"` — ชื่อ + ชื่อสวย + รหัส + ปี
 *   - `"XIAOMI 14T PRO, Xiaomi 2407FPN8EG, Global Model, 2024"` — ชื่อ + รหัส + ภูมิภาค + ปี
 *   - `"OPPO PMC110, Oppo PMC110, Oppo A6c, 2026"` — **ชื่อเป็นรหัส** ชื่อการตลาดอยู่ส่วนที่ 3
 *   - `"APPLE, APPLE IPAD MINI"` — ส่วนแรกเป็นแค่แบรนด์ ชื่อรุ่นอยู่ส่วนที่ 2
 *   - `"Nokia 6030"` — ส่วนเดียว "แบรนด์ รุ่น"
 */

export const TAC_LENGTH = 8

/** URL ไฟล์ดิบบน GitHub — job รายสัปดาห์ดาวน์โหลดด้วย If-None-Match (ETag) */
export const TAC_SOURCE_URL = 'https://raw.githubusercontent.com/MoazEb/tac-database/main/tac_full.csv'
export const TAC_SOURCE_REPO_URL = 'https://github.com/MoazEb/tac-database'

/** หมายเหตุแหล่งที่มา (แสดงในหน้าตั้งค่า) — ข้อมูลชุมชนรวบรวมจากหลายแหล่งรวม Osmocom (CC BY-SA) */
export const TAC_SOURCE_ATTRIBUTION =
  'ข้อมูลยี่ห้อ/รุ่นจาก IMEI (TAC) มาจากฐานข้อมูลเปิด MoazEb/tac-database (สัญญาอนุญาต MIT) ซึ่งรวบรวมจากหลายแหล่ง รวมถึงฐาน TAC ของ Osmocom (CC BY-SA) — เป็นข้อมูลชุมชน อาจไม่ครบหรือคลาดเคลื่อน แก้ไข/ผูกเองได้'

export const TAC_SOURCES = ['tacdb', 'learned', 'manual'] as const
export type DeviceTacSourceCode = (typeof TAC_SOURCES)[number]

export const TAC_SOURCE_LABEL: Readonly<Record<DeviceTacSourceCode, string>> = {
  tacdb: 'ฐาน TAC',
  learned: 'ระบบจำจากงานจริง',
  manual: 'ผู้ดูแลผูกเอง',
}

/** TAC จาก IMEI 15 หลัก (ผ่าน `parseImei()` แล้ว) — รูปแบบอื่น = `null` */
export function tacOfImei(imei: string | null | undefined): string | null {
  if (imei === null || imei === undefined || !/^\d{15}$/.test(imei)) return null
  return imei.slice(0, TAC_LENGTH)
}

/** ค่าที่ผู้ดูแลพิมพ์ในช่องค้นหา/ผูก TAC — ตัดช่องว่าง/ขีด/จุด แล้วต้องเป็นตัวเลข 8 หลักพอดี */
export function parseTacInput(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/[\s\-.]/g, '')
  return /^\d{8}$/.test(digits) ? digits : null
}

/** TAC ในไฟล์ (6–8 หลัก เพราะเลข 0 นำหน้าหาย) → 8 หลัก · นอกนั้น `null` */
export function normalizeTacCell(value: string): string | null {
  const digits = value.trim()
  if (!/^\d{6,8}$/.test(digits)) return null
  return digits.padStart(TAC_LENGTH, '0')
}

// ─── CSV ─────────────────────────────────────────────────────────

/** แยก CSV แบบ RFC 4180 (เครื่องหมายคำพูดครอบ · `""` = `"` · ขึ้นบรรทัดใหม่ในคำพูดได้) — คืนทีละแถว */
export function* iterateCsvRows(text: string): Generator<string[]> {
  let field = ''
  let row: string[] = []
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const length = text.length
  for (; i < length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      yield row
      row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    yield row
  }
}

// ─── แยกยี่ห้อ/รุ่น/ปีจาก SPECS ─────────────────────────────────────

export interface TacSpecs {
  brand: string
  model: string
  /** รหัสรุ่นย่อย/รหัสผู้ผลิต — ไม่มี = `null` */
  variant: string | null
  releaseYear: number | null
}

export interface TacRecord extends TacSpecs {
  tac: string
}

const MIN_YEAR = 1990
const MAX_YEAR = 2100

/** แบรนด์ที่รู้จัก → ชื่อสะกดมาตรฐาน (ไฟล์ต้นทางเป็นตัวใหญ่ทั้งหมดบ้าง ปนกันบ้าง) */
const BRAND_SPELLING: ReadonlyMap<string, string> = new Map(
  [
    ...DEFAULT_FILTER_BRANDS,
    'LG',
    'HTC',
    'Alcatel',
    'TCL',
    'BlackBerry',
    'Meizu',
    'Wiko',
    'Micromax',
    'Lava',
    'Sharp',
    'Kyocera',
    'Fairphone',
    'Blackview',
    'Ulefone',
    'Doogee',
    'Oukitel',
    'Cubot',
    'Umidigi',
    'iQOO',
    'Lenovo',
    'Panasonic',
    'Philips',
    'Siemens',
    'Ericsson',
    'Sony Ericsson',
    'Sagem',
    'Hisense',
  ].map((name) => [normalizeCatalogName(name), name]),
)

/** ชื่อแบรนด์ที่แสดง — แบรนด์ที่รู้จักใช้ตัวสะกดมาตรฐาน · ตัวใหญ่ทั้งหมด = ขึ้นต้นตัวใหญ่ */
export function prettyBrandName(raw: string): string {
  const name = cleanCatalogName(raw)
  const known = BRAND_SPELLING.get(normalizeCatalogName(name))
  if (known !== undefined) return known
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`) : name
}

/** คำในชื่อรุ่นที่สะกดเฉพาะ */
const MODEL_WORD_SPELLING: ReadonlyMap<string, string> = new Map(
  ['iPhone', 'iPad', 'iPod', 'nova', 'POCO', 'iQOO', 'OnePlus', 'ROG', 'HMD', 'ZenFone', 'MediaPad', 'MatePad', 'Xperia'].map(
    (word) => [word.toLowerCase(), word],
  ),
)
const ROMAN = /^(?:II|III|IV|VI|VII|VIII|IX|XI|XII)$/

/** ชื่อรุ่นตัวใหญ่ทั้งหมด → อ่านง่าย ("GALAXY S26 ULTRA" → "Galaxy S26 Ultra") · คำมีตัวเลข/สั้น ≤ 2 ตัว คงตัวใหญ่ */
export function prettyModelName(raw: string): string {
  const name = cleanCatalogName(raw)
  if (name !== name.toUpperCase()) return name
  return name
    .split(' ')
    .map((word) => {
      const known = MODEL_WORD_SPELLING.get(word.toLowerCase())
      if (known !== undefined) return known
      const ordinal = /^(\d+)(ST|ND|RD|TH)$/.exec(word)
      if (ordinal !== null) return `${ordinal[1] ?? ''}${(ordinal[2] ?? '').toLowerCase()}`
      // ชื่อซีรีส์ติดตัวเลข ("RENO5" → "Reno5") — ตัวอักษรนำ ≥ 3 ตัว
      const series = /^([A-Z]{3,})(\d+[A-Z]?)$/.exec(word)
      if (series !== null) return `${(series[1] ?? '').charAt(0)}${(series[1] ?? '').slice(1).toLowerCase()}${series[2] ?? ''}`
      if (/\d/.test(word) || word.length <= 2 || ROMAN.test(word) || !/^[A-Z]+$/.test(word)) return word
      return word.charAt(0) + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/** แยกส่วนของ SPECS ด้วยจุลภาคที่ไม่อยู่ในวงเล็บ */
export function splitSpecsParts(specs: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of specs) {
    if (ch === '(') depth += 1
    if (ch === ')' && depth > 0) depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((part) => cleanCatalogName(part)).filter((part) => part !== '' && part.toUpperCase() !== 'N/A')
}

function asYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null
  const year = Number(value)
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null
}

const REGION_PART = /^(?:\(.*\)|.*\bmodel\b.*|global|china|india|us|eu|europe|japan|korea|latam|international)\??$/i
const CHIP_PART = /^(?:QC |MT |Intel |Exynos|Kirin|Unisoc|Spreadtrum|Tensor|Apple A\d|Snapdragon|Dimensity|Helio|Windows Phone)|modem$/i

function isRegionOrChip(part: string): boolean {
  return REGION_PART.test(part) || CHIP_PART.test(part)
}

/** ตัดคำนำหน้าที่เป็นชื่อแบรนด์/ผู้ผลิต (ไม่สนตัวพิมพ์) ทีละคำ — ตัดแล้วว่าง = คงเดิม */
function stripLeadingWords(value: string, words: readonly string[]): string {
  let rest = value
  let changed = true
  while (changed) {
    changed = false
    for (const word of words) {
      if (word === '') continue
      if (rest.toLowerCase().startsWith(`${word.toLowerCase()} `)) {
        const next = rest.slice(word.length).trim()
        if (next !== '') {
          rest = next
          changed = true
        }
      }
    }
  }
  return rest
}

/**
 * ปีติดท้ายรหัสรุ่น ("SM-A057F/DS2023" · "MEE72018" · "TA-16252024") — แยกเฉพาะเมื่อเหลือรหัสอย่างน้อย 2 ตัว
 * และปีอยู่ในช่วงที่เป็นไปได้ · ไม่ใช่ = คืนตามเดิม
 */
export function splitTrailingYear(code: string, maxYear: number = new Date().getUTCFullYear() + 1): { code: string; year: number | null } {
  const match = /^(.*?[A-Za-z0-9/\-.)][ ]?)((?:19|20)\d{2})$/.exec(code)
  if (match === null) return { code, year: null }
  const head = (match[1] ?? '').trim()
  const year = Number(match[2])
  if (head.replace(/[\s\-/.]/g, '').length < 2 || year < 1995 || year > maxYear) return { code, year: null }
  return { code: head, year }
}

/** คำเดียวที่ดูเป็นรหัส (มีทั้งตัวอักษรและตัวเลข ≥ 5 ตัว หรือมีขีด) — ใช้ตัดสินว่าชื่อในส่วนแรกเป็นรหัสไม่ใช่ชื่อขาย */
function looksLikeCode(value: string): boolean {
  if (value.includes(' ')) return false
  if (value.includes('-') && /\d/.test(value)) return true
  return value.length >= 5 && /\d/.test(value) && /[A-Za-z]/.test(value)
}

function cleanMarketingName(value: string): string {
  return cleanCatalogName(value.replace(/\?/g, '').replace(/\s*\([^)]*\)\s*/g, ' '))
}

/**
 * แยกยี่ห้อ/รุ่น/รหัสรุ่นย่อย/ปีจากแถวของไฟล์ TAC
 * @param brandColumn ค่าคอลัมน์ `Brand` ของไฟล์
 */
export function parseTacSpecs(brandColumn: string, specs: string): TacSpecs | null {
  const parts = splitSpecsParts(specs)
  const brandRaw = cleanCatalogName(brandColumn)
  if (parts.length === 0 && brandRaw === '') return null

  // ปี: ส่วนที่เป็นปีล้วน ๆ ก่อน
  let releaseYear: number | null = null
  const rest: string[] = []
  parts.forEach((part, index) => {
    const year = index === 0 ? null : asYear(part)
    if (year !== null) {
      if (releaseYear === null) releaseYear = year
    } else {
      rest.push(part)
    }
  })

  let title = rest[0] ?? brandRaw
  const others = rest.slice(1)
  let brand = brandRaw === '' ? (title.split(' ')[0] ?? '') : brandRaw

  // รูปแบบ "APPLE, APPLE IPAD MINI" — ส่วนแรกเป็นแค่ชื่อแบรนด์
  if (normalizeCatalogName(title) === normalizeCatalogName(brand) && others.length > 0) {
    title = others.shift() ?? title
  }

  // ผู้ผลิตในส่วนแรก (คำแรก) ต่างจากคอลัมน์แบรนด์ได้ เช่น "XIAOMI POCO F7" ในคอลัมน์ POCO
  const firstWord = title.split(' ')[0] ?? ''
  let model = stripLeadingWords(title, [brand, firstWord])
  // แบรนด์ย่อยที่รู้จักนำหน้าชื่อรุ่น ("XIAOMI REDMI 15C" → Redmi · "HUAWEI HONOR 8" → HONOR)
  const subBrandWord = model.split(' ')[0] ?? ''
  if (
    model.includes(' ') &&
    BRAND_SPELLING.has(normalizeCatalogName(subBrandWord)) &&
    normalizeCatalogName(subBrandWord) !== normalizeCatalogName(brand)
  ) {
    brand = subBrandWord
    model = stripLeadingWords(model, [subBrandWord])
  }

  // ส่วนที่เหลือ: รหัสรุ่น (+ ปีติดท้าย) / ชื่อขาย / ภูมิภาค / ชิป
  const mfrWords = [brand, brandRaw, firstWord]
  let variant: string | null = null
  let nicerName: string | null = null
  let marketingName: string | null = null
  for (const part of others) {
    if (isRegionOrChip(part)) continue
    const split = splitTrailingYear(part)
    if (split.year !== null && releaseYear === null) releaseYear = split.year
    // ตัดชื่อผู้ผลิต (รวมคำต่อท้ายเช่น "Device Company"/"Chongqing"/"Mobile"/"Global") ออก
    const stripped = stripLeadingWords(split.code, [...mfrWords, 'Device', 'Company', 'Chongqing', 'Mobile', 'Global', 'HK'])
    const key = normalizeCatalogName(stripped)
    if (key === normalizeCatalogName(model)) {
      if (nicerName === null && /[a-z]/.test(stripped)) nicerName = stripped
      continue
    }
    if (variant === null && looksLikeCode(stripped.split(' ')[0] ?? stripped) && !stripped.includes(' ')) {
      variant = stripped
      continue
    }
    if (variant === null && /\d/.test(stripped) && stripped.split(' ').length <= 2 && /^[A-Z0-9][A-Z0-9\-/. ]*$/.test(stripped)) {
      variant = stripped
      continue
    }
    const words = stripped.split(' ')
    const lastWord = words[words.length - 1] ?? ''
    if (variant === null && words.length <= 3 && looksLikeCode(lastWord) && marketingName === null && split.code === part) {
      // "Xiaomi 2312DRA50C" (ผู้ผลิตต่างจากแบรนด์ในคอลัมน์) — คำท้ายเป็นรหัส
      if (!/[a-z]{3,}/.test(words.slice(0, -1).join(' ')) || words.length === 2) {
        variant = lastWord
        continue
      }
    }
    if (marketingName === null && split.code !== part) continue
    if (marketingName === null && /[a-z]/.test(stripped)) marketingName = cleanMarketingName(stripped)
  }

  // ชื่อในส่วนแรกเป็นรหัส (เช่น "OPPO PMC110") และมีชื่อขาย ⇒ ใช้ชื่อขาย · รหัสเป็นรุ่นย่อย
  if (looksLikeCode(model) && marketingName !== null && marketingName !== '') {
    if (variant === null) variant = model
    model = stripLeadingWords(marketingName, [...mfrWords])
  } else if (nicerName !== null) {
    model = nicerName
  }

  const brandName = prettyBrandName(brand)
  const modelName = prettyModelName(stripLeadingWords(model, [brandName]))
  if (normalizeCatalogName(brandName) === '' || normalizeCatalogName(modelName) === '') return null
  return {
    brand: brandName,
    model: modelName,
    variant: variant === null || normalizeCatalogName(variant) === normalizeCatalogName(modelName) ? null : variant,
    releaseYear,
  }
}

export interface TacCsvParseResult {
  records: TacRecord[]
  /** แถวข้อมูลทั้งหมด (ไม่นับหัวตาราง) */
  totalRows: number
  /** แถวที่ข้าม (TAC ผิดรูป/แยกยี่ห้อรุ่นไม่ได้/TAC ซ้ำในไฟล์) */
  skippedRows: number
}

export class TacFileFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TacFileFormatError'
  }
}

/** หัวตารางที่รับ — `Brand,TAC,SPECS` (ไม่สนตัวพิมพ์/ช่องว่าง) */
export function isTacCsvHeader(cells: readonly string[]): boolean {
  const names = cells.map((cell) => cell.trim().toLowerCase())
  return names[0] === 'brand' && names[1] === 'tac' && names[2] === 'specs'
}

/**
 * แปลงไฟล์ TAC ทั้งไฟล์ — หัวตารางผิด/ไม่มีแถวที่ใช้ได้เลย = {@link TacFileFormatError}
 * TAC ซ้ำในไฟล์ = ใช้แถวแรก
 */
export function parseTacCsv(text: string): TacCsvParseResult {
  const rows = iterateCsvRows(text)
  const header = rows.next()
  if (header.done === true || !isTacCsvHeader(header.value)) {
    throw new TacFileFormatError('หัวตารางต้องเป็น Brand,TAC,SPECS')
  }
  const seen = new Set<string>()
  const records: TacRecord[] = []
  let totalRows = 0
  let skippedRows = 0
  for (const cells of rows) {
    if (cells.length === 1 && cells[0]?.trim() === '') continue
    totalRows += 1
    const tac = normalizeTacCell(cells[1] ?? '')
    const specs = tac === null ? null : parseTacSpecs(cells[0] ?? '', cells[2] ?? '')
    if (tac === null || specs === null || seen.has(tac)) {
      skippedRows += 1
      continue
    }
    seen.add(tac)
    records.push({ tac, ...specs })
  }
  if (records.length === 0) throw new TacFileFormatError('ไม่พบแถวข้อมูล TAC ที่ใช้ได้ในไฟล์')
  return { records, totalRows, skippedRows }
}

/** ข้อความยี่ห้อ/รุ่นที่เติมให้ฟอร์ม/เคส จากแถว TAC */
export function tacLabel(brandName: string, modelName: string): string {
  const brand = cleanCatalogName(brandName)
  const model = cleanCatalogName(modelName)
  return normalizeCatalogName(model).startsWith(normalizeCatalogName(brand)) ? model : `${brand} ${model}`
}

/**
 * แยกข้อความ "ยี่ห้อ รุ่น" ที่ผู้ใช้พิมพ์เอง (ไม่ได้เลือกจากรายการ) เป็นยี่ห้อ + รุ่น — ใช้ตอนระบบจำ TAC
 * คำแรก = ยี่ห้อ · ที่เหลือ = รุ่น · มีคำเดียว = ยี่ห้อ "ไม่ทราบยี่ห้อ" ไม่จำ (คืน `null`)
 */
export function splitBrandModelText(text: string | null | undefined): { brand: string; model: string } | null {
  const value = cleanCatalogName(text ?? '')
  const space = value.indexOf(' ')
  if (space <= 0) return null
  const brand = value.slice(0, space)
  const model = value.slice(space + 1).trim()
  if (model === '') return null
  return { brand: prettyBrandName(brand), model }
}

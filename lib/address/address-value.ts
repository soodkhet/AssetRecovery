/**
 * ค่าที่อยู่ 1 ชุดในฟอร์ม (`38` §6.1.2) — **pure ล้วน** แยกจาก component เพื่อให้เทสต์/ฝั่ง server ใช้ได้
 *
 * ฟอร์มเก็บทุกช่องเป็น `string` (ช่องว่าง = `''`) แล้วให้ Zod ของโมดูลปลายทางแปลง `''` → `null`
 * เอง (`caseAddressSchema` ทำ preprocess ไว้แล้ว) — ห้ามแปลงเป็น `null` ที่ชั้น component
 */

export interface AddressValue {
  detail: string
  postalCode: string
  province: string
  district: string
  subdistrict: string
}

/** โครงเดียวกับ `CaseAddressDto` ของ API (ค่าที่ยังไม่กรอกเป็น `null`) */
export interface AddressDtoLike {
  detail: string | null
  postalCode: string | null
  province: string | null
  district: string | null
  subdistrict: string | null
}

export const EMPTY_ADDRESS: AddressValue = {
  detail: '',
  postalCode: '',
  province: '',
  district: '',
  subdistrict: '',
}

/** DTO จาก API → ค่าในฟอร์ม */
export function addressFromDto(dto: AddressDtoLike | null | undefined): AddressValue {
  if (dto === null || dto === undefined) return EMPTY_ADDRESS
  return {
    detail: dto.detail ?? '',
    postalCode: dto.postalCode ?? '',
    province: dto.province ?? '',
    district: dto.district ?? '',
    subdistrict: dto.subdistrict ?? '',
  }
}

/** ที่อยู่ชุดนี้ยังว่างทั้งหมดหรือไม่ (ที่อยู่ที่ไม่บังคับจะได้ไม่ต้องส่งชุดว่างขึ้นไป) */
export function isAddressEmpty(value: AddressValue): boolean {
  return Object.values(value).every((field) => field.trim() === '')
}

const BANGKOK_PROVINCES = new Set(['กรุงเทพมหานคร', 'กรุงเทพฯ', 'กรุงเทพ'])

function withPrefix(value: string, prefix: string, alreadyPrefixed: readonly string[]): string {
  return alreadyPrefixed.some((known) => value.startsWith(known)) ? value : `${prefix}${value}`
}

const KNOWN_SUBDISTRICT_PREFIXES = ['ต.', 'ตำบล', 'แขวง'] as const
const KNOWN_DISTRICT_PREFIXES = ['อ.', 'อำเภอ', 'เขต'] as const

/** คำนำหน้าแบบย่อ (เอกสาร) / เต็ม (หน้าจอ) — กรุงเทพมหานครใช้ แขวง/เขต ทั้งสองแบบ */
const PREFIX_STYLE = {
  short: { subdistrict: 'ต.', district: 'อ.', province: 'จ.' },
  full: { subdistrict: 'ตำบล', district: 'อำเภอ', province: 'จังหวัด' },
} as const

function formatAddressLine(
  address: AddressDtoLike | null | undefined,
  style: keyof typeof PREFIX_STYLE,
): string | null {
  if (address === null || address === undefined) return null
  const clean = (value: string | null): string => (value ?? '').trim()
  const detail = clean(address.detail)
  const subdistrict = clean(address.subdistrict)
  const district = clean(address.district)
  const province = clean(address.province)
  const postalCode = clean(address.postalCode)
  const bangkok = BANGKOK_PROVINCES.has(province)
  const prefix = PREFIX_STYLE[style]

  const parts = [
    detail,
    subdistrict === ''
      ? ''
      : withPrefix(subdistrict, bangkok ? 'แขวง' : prefix.subdistrict, KNOWN_SUBDISTRICT_PREFIXES),
    district === '' ? '' : withPrefix(district, bangkok ? 'เขต' : prefix.district, KNOWN_DISTRICT_PREFIXES),
    province === '' ? '' : bangkok ? 'กรุงเทพมหานคร' : withPrefix(province, prefix.province, ['จ.', 'จังหวัด']),
    postalCode,
  ].filter((part) => part !== '')
  return parts.length === 0 ? null : parts.join(' ')
}

/**
 * ที่อยู่ 1 ชุด → ข้อความบรรทัดเดียวสำหรับเอกสาร (ใบ 50 ทวิ / ไฟล์ส่งสำนักงานบัญชี — มติ PO U94 ข้อ 1)
 * - กรุงเทพมหานคร ใช้ "แขวง/เขต" · จังหวัดอื่นใช้ "ต./อ./จ." (ไม่เติมซ้ำถ้าผู้ใช้พิมพ์คำนำหน้ามาเอง)
 * - ช่องว่างถูกข้าม · ว่างทั้งชุด = `null` (ผู้เรียกพิมพ์ "—" บนเอกสารทางการเอง)
 */
export function formatThaiAddressLine(address: AddressDtoLike | null | undefined): string | null {
  return formatAddressLine(address, 'short')
}

/**
 * แบบคำเต็มสำหรับหน้าจอ ("ตำบล…อำเภอ…จังหวัด…") — กรุงเทพมหานครใช้ "แขวง…เขต…" (mytester C-04)
 * · กติกาเดียวกับ {@link formatThaiAddressLine} ต่างแค่คำนำหน้า
 */
export function formatThaiAddressLineFull(address: AddressDtoLike | null | undefined): string | null {
  return formatAddressLine(address, 'full')
}

const PROVINCIAL_LINE = /^(.*\S)\s+ต\.(\S+)\s+อ\.(\S+)\s+จ\.(\S+)\s+(\d{5})$/
const BANGKOK_LINE = /^(.*\S)\s+แขวง(\S+)\s+เขต(\S+)\s+กรุงเทพมหานคร\s+(\d{5})$/

/**
 * ย้อนข้อความบรรทัดเดียวที่ {@link formatThaiAddressLine} สร้าง กลับเป็น 5 ช่อง — ใช้กับตารางที่เก็บที่อยู่เป็น
 * คอลัมน์เดียว (บริษัทไฟแนนซ์ — mytester2 A2-03) ให้ฟอร์มแก้ไขเปิดช่องเลือกจังหวัด/อำเภอ/ตำบลได้อีก
 * · ต้องครบ 5 ช่อง **และ** จัดรูปกลับแล้วได้ข้อความเดิมทุกตัวอักษร ⇒ ไม่เช่นนั้น `null` (ข้อความพิมพ์เองแบบเก่า
 *   ผู้เรียกต้องเก็บไว้ทั้งก้อน ห้ามเดาแยก)
 */
export function parseThaiAddressLine(line: string): AddressValue | null {
  const text = line.trim()
  const provincial = PROVINCIAL_LINE.exec(text)
  const bangkok = provincial === null ? BANGKOK_LINE.exec(text) : null
  let value: AddressValue | null = null
  if (provincial !== null) {
    const [, detail = '', subdistrict = '', district = '', province = '', postalCode = ''] = provincial
    value = { detail, subdistrict, district, province, postalCode }
  } else if (bangkok !== null) {
    const [, detail = '', subdistrict = '', district = '', postalCode = ''] = bangkok
    value = { detail, subdistrict, district, province: 'กรุงเทพมหานคร', postalCode }
  }
  if (value === null || BANGKOK_PROVINCES.has(value.province) !== (bangkok !== null)) return null
  return formatThaiAddressLine(value) === text ? value : null
}

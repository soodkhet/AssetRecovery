/**
 * Master data ที่อยู่ไทย (`38` §6.1.2) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * ที่อยู่ทุกชุดในระบบ (เคส 3 ที่อยู่ของไฟล์ 38 · จุดลงพื้นที่ของไฟล์ 41) ต้องอ้างชุดนี้ที่เดียว
 * ห้ามประกาศรายชื่อจังหวัด/อำเภอ/ตำบลซ้ำในโมดูลตัวเอง
 *
 * ⚠️ ขอบเขตข้อมูลตอนนี้ (Open Items ของ `38` §22 ข้อ 4–5 — ยังไม่ตัดสินใจ ห้ามเดา)
 * - **จังหวัด 77 จังหวัดครบ** — ใช้เป็น dropdown จริงได้ทันที (`38` §6.1.2 ข้อ 3)
 * - **อำเภอ/ตำบล**: ยังไม่มี master data ทางการ (กรมการปกครอง) ในระบบ — ชุดตัวอย่างด้านล่างมาจาก
 *   mockup `38-case-submission-mockup.html` (`DISTRICT_DATA`) เท่านั้น จังหวัดที่ไม่มีข้อมูลให้ฟอร์ม
 *   รับค่าพิมพ์เองได้ตามที่ §6.1.2 อนุญาต ("ถ้าไม่พบในระบบ ให้ผู้ใช้กรอกต่อแบบ manual ทีละขั้น")
 * - **รหัสไปรษณีย์**: `lookupPostalCode()` เป็น async ตั้งแต่วันแรกเพื่อให้สลับไปเรียก Thailand Post API
 *   จริงได้โดยไม่ต้องแก้จุดเรียกใช้ — ตอนนี้ค้นจากตารางตัวอย่างในไฟล์นี้
 *
 * เติม master data จริง = แก้ `DISTRICT_DATA` / `POSTAL_CODE_AREAS` ที่นี่ที่เดียว (หรือเปลี่ยนตัวใน
 * `lookupPostalCode()` เป็น fetch) — หน้าจอที่ใช้ `<AddressFields>` ไม่ต้องแก้อะไรเลย
 */

export interface ProvinceRegionGroup {
  readonly region: string
  readonly provinces: readonly string[]
}

/** 77 จังหวัด จัดกลุ่ม 6 ภาคตามการแบ่งของกรมการปกครอง — ใช้ทำ `<optgroup>` ใน dropdown */
export const THAI_PROVINCE_REGIONS: readonly ProvinceRegionGroup[] = [
  {
    region: 'ภาคกลาง',
    provinces: [
      'กรุงเทพมหานคร',
      'กำแพงเพชร',
      'ชัยนาท',
      'นครนายก',
      'นครปฐม',
      'นครสวรรค์',
      'นนทบุรี',
      'ปทุมธานี',
      'พระนครศรีอยุธยา',
      'พิจิตร',
      'พิษณุโลก',
      'เพชรบูรณ์',
      'ลพบุรี',
      'สมุทรปราการ',
      'สมุทรสงคราม',
      'สมุทรสาคร',
      'สระบุรี',
      'สิงห์บุรี',
      'สุโขทัย',
      'สุพรรณบุรี',
      'อ่างทอง',
      'อุทัยธานี',
    ],
  },
  {
    region: 'ภาคเหนือ',
    provinces: [
      'เชียงราย',
      'เชียงใหม่',
      'น่าน',
      'พะเยา',
      'แพร่',
      'แม่ฮ่องสอน',
      'ลำปาง',
      'ลำพูน',
      'อุตรดิตถ์',
    ],
  },
  {
    region: 'ภาคตะวันออกเฉียงเหนือ',
    provinces: [
      'กาฬสินธุ์',
      'ขอนแก่น',
      'ชัยภูมิ',
      'นครพนม',
      'นครราชสีมา',
      'บึงกาฬ',
      'บุรีรัมย์',
      'มหาสารคาม',
      'มุกดาหาร',
      'ยโสธร',
      'ร้อยเอ็ด',
      'เลย',
      'ศรีสะเกษ',
      'สกลนคร',
      'สุรินทร์',
      'หนองคาย',
      'หนองบัวลำภู',
      'อำนาจเจริญ',
      'อุดรธานี',
      'อุบลราชธานี',
    ],
  },
  {
    region: 'ภาคตะวันออก',
    provinces: ['จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ตราด', 'ปราจีนบุรี', 'ระยอง', 'สระแก้ว'],
  },
  {
    region: 'ภาคตะวันตก',
    provinces: ['กาญจนบุรี', 'ตาก', 'ประจวบคีรีขันธ์', 'เพชรบุรี', 'ราชบุรี'],
  },
  {
    region: 'ภาคใต้',
    provinces: [
      'กระบี่',
      'ชุมพร',
      'ตรัง',
      'นครศรีธรรมราช',
      'นราธิวาส',
      'ปัตตานี',
      'พังงา',
      'พัทลุง',
      'ภูเก็ต',
      'ยะลา',
      'ระนอง',
      'สงขลา',
      'สตูล',
      'สุราษฎร์ธานี',
    ],
  },
]

/** รายชื่อจังหวัดแบบแบน (เรียงตามภาค → ชื่อ) — 77 รายการ */
export const THAI_PROVINCES: readonly string[] = THAI_PROVINCE_REGIONS.flatMap((group) => group.provinces)

const PROVINCE_SET = new Set(THAI_PROVINCES)

/** จังหวัดนี้อยู่ในทะเบียน 77 จังหวัดหรือไม่ (ใช้ validate ค่าที่ผู้ใช้/ไฟล์ import ส่งมา) */
export function isThaiProvince(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return PROVINCE_SET.has(value.trim())
}

/**
 * ตัวอย่างอำเภอ/ตำบล — **ไม่ใช่ master data ครบ** (Open Item `38` §22 ข้อ 5)
 * จังหวัดที่ไม่มีคีย์ในนี้ = ฟอร์มให้พิมพ์อำเภอ/ตำบลเอง (ไม่ block การกรอก)
 */
export const DISTRICT_DATA: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  กรุงเทพมหานคร: {
    บางนา: ['บางนา', 'บางนาเหนือ'],
    จตุจักร: ['จตุจักร', 'เสนานิคม'],
    ลาดพร้าว: ['ลาดพร้าว', 'จรเข้บัว'],
  },
  นนทบุรี: {
    เมืองนนทบุรี: ['สวนใหญ่', 'ตลาดขวัญ'],
    บางใหญ่: ['บางใหญ่', 'บางม่วง'],
  },
  เชียงใหม่: {
    เมืองเชียงใหม่: ['ศรีภูมิ', 'ช้างคลาน', 'หายยา'],
    สันทราย: ['สันทรายหลวง', 'หนองหาร'],
  },
  ภูเก็ต: {
    เมืองภูเก็ต: ['ตลาดใหญ่', 'รัษฎา'],
    กะทู้: ['กะทู้', 'ป่าตอง'],
  },
}

/** อำเภอ/เขตของจังหวัดที่เลือก — ไม่มีข้อมูลตัวอย่าง = คืน array ว่าง (ฟอร์มเปลี่ยนเป็นช่องพิมพ์เอง) */
export function getDistricts(province: string | null | undefined): readonly string[] {
  if (typeof province !== 'string') return []
  return Object.keys(DISTRICT_DATA[province.trim()] ?? {})
}

/** ตำบล/แขวงของอำเภอที่เลือก (cascading ตาม `38` §6.1.2 ข้อ 5) */
export function getSubDistricts(
  province: string | null | undefined,
  district: string | null | undefined,
): readonly string[] {
  if (typeof province !== 'string' || typeof district !== 'string') return []
  return DISTRICT_DATA[province.trim()]?.[district.trim()] ?? []
}

const POSTAL_CODE_PATTERN = /^\d{5}$/

/** รหัสไปรษณีย์ = ตัวเลข 5 หลักพอดี (`38` §6.1.2 ข้อ 2 — ตรงกับ `caseAddressSchema`) */
export function isValidPostalCode(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return POSTAL_CODE_PATTERN.test(value.trim())
}

export interface PostalCodeArea {
  readonly postalCode: string
  readonly province: string
  readonly district: string
  readonly subdistrict: string
}

/**
 * ตารางรหัสไปรษณีย์ตัวอย่าง (mockup `POSTAL_CODE_LOOKUP`) — **placeholder ของ Thailand Post API**
 * ทุกแถวต้องชี้ไปยังจังหวัด/อำเภอ/ตำบลที่มีอยู่จริงใน `DISTRICT_DATA` (มีเทสต์ยาม)
 */
export const POSTAL_CODE_AREAS: Readonly<Record<string, PostalCodeArea>> = {
  '10260': { postalCode: '10260', province: 'กรุงเทพมหานคร', district: 'บางนา', subdistrict: 'บางนา' },
  '10900': { postalCode: '10900', province: 'กรุงเทพมหานคร', district: 'จตุจักร', subdistrict: 'จตุจักร' },
  '11000': { postalCode: '11000', province: 'นนทบุรี', district: 'เมืองนนทบุรี', subdistrict: 'สวนใหญ่' },
  '50200': { postalCode: '50200', province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', subdistrict: 'ศรีภูมิ' },
  '83000': { postalCode: '83000', province: 'ภูเก็ต', district: 'เมืองภูเก็ต', subdistrict: 'ตลาดใหญ่' },
}

/**
 * ค้นจังหวัด/อำเภอ/ตำบลจากรหัสไปรษณีย์ (`38` §6.1.2 ข้อ 2)
 *
 * **async ตั้งแต่วันแรกโดยตั้งใจ** — เมื่อเลือก provider จริงได้แล้ว (Open Item `38` §22 ข้อ 4)
 * ให้เปลี่ยนไส้ในเป็น fetch + fallback ที่นี่ที่เดียว จุดเรียกใช้ไม่ต้องแก้
 * ไม่พบ = คืน `null` (ไม่ throw) เพราะฟอร์มต้องให้กรอกเองต่อได้ ไม่ใช่ block
 */
export async function lookupPostalCode(code: string): Promise<PostalCodeArea | null> {
  if (!isValidPostalCode(code)) return null
  return POSTAL_CODE_AREAS[code.trim()] ?? null
}

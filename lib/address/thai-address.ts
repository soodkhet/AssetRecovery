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
 * - **รหัสไปรษณีย์ครบทั้งประเทศ** (มติ PO 03/10/2569 — UAT Q19, BUG-036): 966 รหัส / 7,436 ตำบล
 *   จาก kongvut/thai-province-data (MIT — `lib/address/data/THIRD_PARTY_LICENSE.md`) แปลงด้วย
 *   `scripts/build-thai-postal-data.ts` เป็น `lib/address/data/thai-postal.json` · `lookupPostalCode()`
 *   โหลดไฟล์นี้แบบ **dynamic import ครั้งแรกที่เรียก** (แยก chunk — ไม่บวม bundle หน้าแรกฝั่ง client)
 *
 * เติม master data อำเภอ/ตำบล = แก้ `DISTRICT_DATA` ที่นี่ที่เดียว · อัปเดตรหัสไปรษณีย์ = รันสคริปต์สร้างใหม่
 * — หน้าจอที่ใช้ `<AddressFields>` ไม่ต้องแก้อะไรเลย
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
 * รูปแบบไฟล์ `data/thai-postal.json`: รหัส → `[จังหวัด, อำเภอ/เขต, ตำบล/แขวง[]][]`
 * ชื่อไม่มีคำนำหน้า (ไม่มี "เขต/อำเภอ/แขวง/ตำบล") — ตรงกับค่าที่ฟอร์ม/ข้อมูลเคสใช้
 */
type PostalTable = Readonly<Record<string, readonly (readonly unknown[])[]>>

let postalTablePromise: Promise<PostalTable> | null = null

/** โหลดตารางครั้งเดียวแล้ว cache (dynamic import → bundler แยกเป็น chunk ที่โหลดเมื่อใช้จริง) */
function loadPostalTable(): Promise<PostalTable> {
  if (postalTablePromise === null) {
    postalTablePromise = import('./data/thai-postal.json').then(
      (mod) => mod.default as PostalTable,
      (error: unknown) => {
        postalTablePromise = null // โหลดพลาด (เช่น เน็ตหลุด) → ครั้งหน้าลองใหม่ได้
        throw error
      },
    )
  }
  return postalTablePromise
}

function toAreas(code: string, groups: readonly (readonly unknown[])[]): PostalCodeArea[] {
  const areas: PostalCodeArea[] = []
  for (const [province, district, subdistricts] of groups) {
    if (typeof province !== 'string' || typeof district !== 'string' || !Array.isArray(subdistricts)) continue
    for (const subdistrict of subdistricts) {
      if (typeof subdistrict === 'string') areas.push({ postalCode: code, province, district, subdistrict })
    }
  }
  return areas
}

/**
 * ค้นจังหวัด/อำเภอ/ตำบลจากรหัสไปรษณีย์ (`38` §6.1.2 ข้อ 2) — ข้อมูลจริงทั้งประเทศ
 *
 * รหัสเดียวมักครอบคลุม**หลายตำบล** (บางรหัสข้ามอำเภอ/ข้ามจังหวัด) จึงคืนทุกพื้นที่ที่ตรง
 * ให้ฟอร์มเลือก · ไม่พบ/รูปแบบผิด = คืน array ว่าง (ไม่ throw เพราะฟอร์มต้องให้กรอกเองต่อได้)
 */
export async function lookupPostalCode(code: string): Promise<readonly PostalCodeArea[]> {
  if (!isValidPostalCode(code)) return []
  const key = code.trim()
  const table = await loadPostalTable()
  const groups = Object.hasOwn(table, key) ? table[key] : undefined
  return groups === undefined ? [] : toAreas(key, groups)
}

/** ส่วนที่ทุกพื้นที่ของรหัสนี้ใช้ร่วมกัน (จังหวัด/อำเภอเดียวกันหมด) — ใช้เติมให้ล่วงหน้าก่อนผู้ใช้เลือกตำบล */
export function commonPostalArea(
  areas: readonly PostalCodeArea[],
): { province: string; district: string; subdistrict: string } {
  const first = areas[0]
  if (first === undefined) return { province: '', district: '', subdistrict: '' }
  const sameProvince = areas.every((area) => area.province === first.province)
  const sameDistrict = sameProvince && areas.every((area) => area.district === first.district)
  return {
    province: sameProvince ? first.province : '',
    district: sameDistrict ? first.district : '',
    subdistrict: areas.length === 1 ? first.subdistrict : '',
  }
}

/**
 * staging E-017 — ตัวเลือกอำเภอ/ตำบลของช่องกรอก: ชุดตัวอย่างเดิม (`DISTRICT_DATA`) **รวมกับ**พื้นที่จากรหัสไปรษณีย์ที่ค้นได้
 * (ข้อมูลจริงทั้งประเทศ) ⇒ จังหวัดนอกชุดตัวอย่างก็มีรายการตำบลให้เลือกหลังกรอกรหัสไปรษณีย์ · ไม่ซ้ำ คงลำดับ
 */
export function districtOptions(province: string, areas: readonly PostalCodeArea[]): string[] {
  const fromPostal = areas.filter((area) => area.province === province.trim()).map((area) => area.district)
  return [...new Set([...getDistricts(province), ...fromPostal])]
}

export function subdistrictOptions(province: string, district: string, areas: readonly PostalCodeArea[]): string[] {
  const fromPostal = areas
    .filter((area) => area.province === province.trim() && area.district === district.trim())
    .map((area) => area.subdistrict)
  return [...new Set([...getSubDistricts(province, district), ...fromPostal])]
}

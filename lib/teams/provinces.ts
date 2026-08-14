/**
 * PROVINCE_DATA — จังหวัดที่ทีมรับผิดชอบได้ (`09` §8 "จังหวัดตาม PROVINCE_DATA")
 *
 * ที่มาของข้อมูล: mockup `reference/settings.html` (`const PROVINCE_DATA`) ซึ่งเป็น source of truth
 * ด้าน UI ของ province picker — ยังไม่มีตาราง master ใน `02` จึงเก็บเป็น **pure constant**
 * (ไม่แตะ Prisma) ให้ทั้ง FE (checkbox picker) และ BE (validate ค่าที่ส่งมา) ใช้ชุดเดียวกัน
 *
 * ⚠️ ไม่ใช่รายชื่อ 77 จังหวัดของประเทศไทย — เป็นพื้นที่ให้บริการเท่าที่ mockup กำหนดไว้
 * เพิ่มจังหวัดใหม่ = แก้ที่นี่ที่เดียว (mockup ก็ต้องแก้คู่กันตาม Rule 05)
 * บางจังหวัดอยู่ 2 ภาคใน mockup (เช่น ราชบุรี = กลาง+ตะวันตก) — คงไว้ตามต้นฉบับ ตัวตรวจใช้ชุด unique
 */

export interface ProvinceRegion {
  region: string
  provinces: readonly string[]
}

export const PROVINCE_DATA: readonly ProvinceRegion[] = [
  {
    region: 'ภาคกลาง',
    provinces: [
      'กรุงเทพมหานคร',
      'นนทบุรี',
      'ปทุมธานี',
      'นครปฐม',
      'สมุทรปราการ',
      'สมุทรสาคร',
      'สมุทรสงคราม',
      'ราชบุรี',
      'เพชรบุรี',
      'ประจวบคีรีขันธ์',
      'สุพรรณบุรี',
      'ชลบุรี',
      'ระยอง',
      'จันทบุรี',
      'ตราด',
    ],
  },
  {
    region: 'ภาคเหนือ',
    provinces: ['เชียงใหม่', 'เชียงราย', 'น่าน', 'พะเยา', 'แพร่', 'แม่ฮ่องสอน', 'ลำปาง', 'ลำพูน', 'อุตรดิตถ์'],
  },
  {
    region: 'ภาคตะวันออกเฉียงเหนือ',
    provinces: [
      'มุกดาหาร',
      'นครราชสีมา',
      'ขอนแก่น',
      'อุบลราชธานี',
      'เลย',
      'ยโสธร',
      'ร้อยเอ็ด',
      'กาฬสินธุ์',
      'มหาสารคาม',
      'ชัยภูมิ',
      'นครพนม',
      'สกลนคร',
      'บึงกาฬ',
    ],
  },
  {
    region: 'ภาคใต้',
    provinces: [
      'ภูเก็ต',
      'กระบี่',
      'พังงา',
      'สุราษฎร์ธานี',
      'นครศรีธรรมราช',
      'พัทลุง',
      'สตูล',
      'สงขลา',
      'ตรัง',
      'ยะลา',
      'ปัตตานี',
    ],
  },
  {
    region: 'ภาคตะวันตก',
    provinces: [
      'ราชบุรี',
      'เพชรบุรี',
      'ประจวบคีรีขันธ์',
      'กาญจนบุรี',
      'สุพรรณบุรี',
      'เพชรบูรณ์',
      'ลพบุรี',
      'สิงห์บุรี',
      'ปราจีนบุรี',
      'สระแก้ว',
    ],
  },
] as const

/** ชุดจังหวัดที่ใช้ได้ทั้งหมด (unique) — ใช้ตรวจค่าที่ client ส่งมา */
const PROVINCE_SET: ReadonlySet<string> = new Set(PROVINCE_DATA.flatMap((region) => region.provinces))

/** รายชื่อจังหวัดแบบ unique เรียงตามลำดับที่ปรากฏใน `PROVINCE_DATA` (ใช้ทำ dropdown filter) */
export const PROVINCE_LIST: readonly string[] = [...PROVINCE_SET]

export function isKnownProvince(value: string): boolean {
  return PROVINCE_SET.has(value)
}

/** จังหวัดที่ไม่รู้จักในรายการที่ส่งมา — คืน `[]` แปลว่าผ่านทั้งหมด */
export function unknownProvinces(values: readonly string[]): string[] {
  return values.filter((value) => !PROVINCE_SET.has(value))
}

/** ภาคของจังหวัด (ตัวแรกที่เจอ — จังหวัดที่อยู่ 2 ภาคคืนภาคแรกตามลำดับใน `PROVINCE_DATA`) */
export function provinceRegion(province: string): string | null {
  return PROVINCE_DATA.find((region) => region.provinces.includes(province))?.region ?? null
}

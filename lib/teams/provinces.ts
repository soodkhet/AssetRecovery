import { THAI_PROVINCE_REGIONS, type ProvinceRegionGroup } from '@/lib/address/thai-address'

/**
 * PROVINCE_DATA — จังหวัดที่ทีมรับผิดชอบได้ (`09` §8 "จังหวัดตาม PROVINCE_DATA")
 *
 * = ทะเบียน **77 จังหวัด** 6 ภาค ของ `lib/address/thai-address.ts` (ชุดเดียวกับที่อยู่ลูกหนี้ — ห้ามประกาศรายชื่อซ้ำ)
 * staging E-018: เดิมคัดจาก mockup 58 แถว (ซ้ำ 4 · ขาด 23 จังหวัด) ⇒ เคสที่อยู่จังหวัดนอกรายการจับคู่ทีมไม่ได้เลย
 * (`CASE_NO_TEAM_MATCH`) · ชื่อจังหวัดเดิมทุกชื่ออยู่ในชุด 77 จังหวัด ⇒ ข้อมูลทีมเดิมไม่ต้องย้าย
 * pure constant ใช้ทั้ง FE (checkbox picker) และ BE (validate ค่าที่ส่งมา)
 */

export type ProvinceRegion = ProvinceRegionGroup

export const PROVINCE_DATA: readonly ProvinceRegion[] = THAI_PROVINCE_REGIONS

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

/** ภาคของจังหวัด (ตามการแบ่งของกรมการปกครองใน `THAI_PROVINCE_REGIONS`) */
export function provinceRegion(province: string): string | null {
  return PROVINCE_DATA.find((region) => region.provinces.includes(province))?.region ?? null
}

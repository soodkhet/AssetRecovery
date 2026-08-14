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

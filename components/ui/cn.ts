import { twMerge } from 'tailwind-merge'

/**
 * ต่อคลาส Tailwind แบบข้ามค่าที่เป็น false/undefined แล้ว merge คลาสที่ขัดกันให้ตัวหลังชนะ
 * (เช่น `w-full` ใน FIELD_CLASS ของ Select ถูก `w-44` ที่ผู้เรียกส่งมาทับได้จริง — ก่อนหน้านี้แค่ต่อสตริงจึงแพ้ลำดับ CSS)
 */
export function cn(...values: ReadonlyArray<string | false | null | undefined>): string {
  return twMerge(values.filter((value): value is string => Boolean(value)).join(' '))
}

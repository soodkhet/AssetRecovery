/** ต่อคลาส Tailwind แบบข้ามค่าที่เป็น false/undefined — เล็กพอที่ยังไม่ต้องพึ่ง `clsx` */
export function cn(...values: ReadonlyArray<string | false | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(' ')
}

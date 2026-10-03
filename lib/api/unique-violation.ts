import { Prisma } from '@/lib/generated/prisma/client'

/**
 * ตัวช่วยกลางแปลง Prisma `P2002` (ชน unique constraint ระดับ DB) ให้เป็น error code ของโมดูล
 *
 * แพตเทิร์น "read-then-insert + unique index + จับ P2002" ของโปรเจกต์:
 *   1. pre-check (อ่านก่อน) ให้ข้อความที่ถูกต้องในกรณีปกติ
 *   2. คำขอที่แข่งกันยิงพร้อมกันหลุด pre-check ทั้งคู่ → ตัวที่แพ้ชน unique index ได้ P2002
 *   3. `onUniqueViolation(handler)` จับ P2002 แล้วเรียก handler — ปกติคือรัน pre-check ซ้ำ (ตอนนี้แถวของ
 *      อีกฝั่ง commit แล้วจึงเจอ) ซึ่งจะโยน error code ที่ตรงช่องจริง (ไม่ต้องเดาจาก `meta.target` ที่ driver
 *      adapter แต่ละตัวรายงานไม่เหมือนกัน) แล้วโยน fallback เสมอถ้า pre-check ไม่เจอ · error อื่นโยนต่อเดิม
 *
 * ใช้ต่อท้าย promise: `await prisma.$transaction(...).catch(onUniqueViolation(() => { throw ... }))`
 * ก่อนมีตัวช่วยนี้ P2002 หลุดเป็น 500 body ว่าง (UAT BUG-016)
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function onUniqueViolation(
  handler: (error: unknown) => Promise<never> | never,
): (error: unknown) => Promise<never> {
  return async (error: unknown) => {
    if (!isUniqueViolation(error)) throw error
    return handler(error)
  }
}

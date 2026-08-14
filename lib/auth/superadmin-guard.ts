import { AuthError } from '@/lib/auth/errors'

/**
 * Guard กัน lockout: ระบบต้องมี Superadmin ที่ใช้งานได้อย่างน้อย 1 คนเสมอ
 * (`05` §10/§16 "Superadmin lockout" · `07` §11 `LAST_SUPERADMIN_REMOVAL`)
 *
 * ครอบทั้ง 2 ทางที่ทำให้ Superadmin คนสุดท้ายหายไป: เปลี่ยนสถานะเป็นไม่ active และย้าย role ออก
 */
export interface LastSuperadminCheck {
  /** ตอนนี้ target เป็น Superadmin อยู่หรือไม่ */
  isSuperadminNow: boolean
  /** ตอนนี้ target สถานะ active อยู่หรือไม่ */
  isActiveNow: boolean
  /** หลังการแก้ไข target จะยังเป็น Superadmin หรือไม่ */
  willBeSuperadmin: boolean
  /** หลังการแก้ไข target จะยัง active หรือไม่ */
  willBeActive: boolean
  /** จำนวน Superadmin ที่ active อยู่ในองค์กร **รวม target เอง** (นับก่อนแก้ไข) */
  activeSuperadminCount: number
}

export function violatesLastSuperadminRule(check: LastSuperadminCheck): boolean {
  const countsNow = check.isSuperadminNow && check.isActiveNow
  const countsAfter = check.willBeSuperadmin && check.willBeActive
  if (!countsNow || countsAfter) return false
  return check.activeSuperadminCount <= 1
}

/**
 * โยน `LAST_SUPERADMIN_REMOVAL` เมื่อการแก้ไขจะทำให้ไม่เหลือ Superadmin ที่ active
 * (ตัวนับจาก DB อยู่ที่ `lib/auth/superadmin-queries.ts` — แยกไว้ให้ไฟล์นี้เป็น pure)
 */
export function assertNotLastSuperadmin(check: LastSuperadminCheck): void {
  if (violatesLastSuperadminRule(check)) {
    throw new AuthError('LAST_SUPERADMIN_REMOVAL')
  }
}

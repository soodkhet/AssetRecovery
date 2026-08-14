import { EXECUTIVE_ROLE_NAME, SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'

/**
 * Capability ที่ **ล็อกไว้กับ role เดียว** — มอบให้ role อื่นไม่ได้ และแก้ระดับสิทธิ์ไม่ได้
 * (`25` §16.1 สัญลักษณ์ "✅ only" · `13` §6.10 · UI แสดง 🔒)
 *
 * ### ที่มาของรายชื่อ (มติ Product Owner 14/08/2569)
 * `25` §16.1 เขียนกำกับไว้ว่า "7 รายการ" แต่ตัว matrix §7 มีแถวที่ติด `✅ only` จริง **8 แถว**
 * (คอลัมน์ Superadmin 5 + คอลัมน์ **บริหาร (Executive)** 3) ส่วน mockup `settings.html` ติดธง
 * `superadminOnly` ไว้ 6 รายการ (รวม `manage_roles` ที่ไม่ได้อยู่ใน matrix ของ `25` แต่ `07` §12
 * ระบุว่าเป็นของ Superadmin เต็มสิทธิ์) — ตัวเลข 7 ในเชิงอรรถจึงเป็นการนับตกหล่น
 * PO เคาะให้ยึด**รายแถวจริง**: ล็อกทั้งหมด **9 รายการ = Superadmin 6 + Executive 3**
 *
 * ⚠️ เพิ่ม/ลดรายการที่นี่ = เปลี่ยนสิทธิ์ระดับระบบ ต้องมีมติ PO + แก้ `25`/`13` คู่กันเสมอ
 */

/** ชื่อ role ที่เป็นเจ้าของ capability ที่ถูกล็อก (ต้องตรงกับ seed role ใน `07` §5 กลุ่ม `system`) */
export type CapabilityLockOwner = typeof SUPERADMIN_ROLE_NAME | typeof EXECUTIVE_ROLE_NAME

/** capability code → role เจ้าของสิทธิ์ (`prisma/seed.ts` ทำเครื่องหมาย 🔒 ไว้ตรงกัน) */
export const CAPABILITY_LOCKS: Readonly<Record<string, CapabilityLockOwner>> = {
  // Superadmin 6 รายการ — master data / ตั้งค่าที่กระทบทั้งระบบ (`25` §7.1 + `07` §12)
  manage_companies: SUPERADMIN_ROLE_NAME,
  manage_service_fees: SUPERADMIN_ROLE_NAME,
  manage_tax_profiles: SUPERADMIN_ROLE_NAME,
  manage_period_lock_policy: SUPERADMIN_ROLE_NAME,
  manage_invoice_numbering: SUPERADMIN_ROLE_NAME,
  manage_roles: SUPERADMIN_ROLE_NAME,
  // บริหาร (Executive) 3 รายการ — จุดเสี่ยงสูงที่ `25` §7.4/§7.5 ติด "✅ only" ไว้ในคอลัมน์ Executive
  approve_adjustment_locked: EXECUTIVE_ROLE_NAME,
  unlock_period: EXECUTIVE_ROLE_NAME,
  authorize_exception: EXECUTIVE_ROLE_NAME,
}

/** จำนวนรายการที่ถูกล็อกตามมติ PO — ใช้เป็นยามในเทสต์ (เปลี่ยนตัวเลขนี้ต้องมีมติใหม่) */
export const LOCKED_CAPABILITY_COUNT = 9

/** role เจ้าของ capability ที่ถูกล็อก — `null` = capability ปกติ (แก้ได้ตามปกติ) */
export function capabilityLockOwner(code: string): CapabilityLockOwner | null {
  return CAPABILITY_LOCKS[code] ?? null
}

export function isCapabilityLocked(code: string): boolean {
  return capabilityLockOwner(code) !== null
}

/** role นี้เป็นเจ้าของ capability ที่ถูกล็อกหรือไม่ (เจ้าของอยู่กลุ่ม `system` เท่านั้น — `07` §5.1) */
export function ownsLockedCapability(roleName: string, code: string): boolean {
  const owner = capabilityLockOwner(code)
  return owner !== null && owner === roleName
}

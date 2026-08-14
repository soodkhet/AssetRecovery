import { describe, expect, it } from 'vitest'
import { EXECUTIVE_ROLE_NAME, SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import {
  CAPABILITY_LOCKS,
  LOCKED_CAPABILITY_COUNT,
  capabilityLockOwner,
  isCapabilityLocked,
  ownsLockedCapability,
} from '@/lib/roles/capability-locks'

/**
 * ยามของมติ PO 14/08/2569 — ล็อก 9 รายการ (Superadmin 6 + Executive 3) ตามแถว "✅ only" ใน `25` §7
 * เทสต์ชุดนี้แดง = มีคนเปลี่ยนรายการสิทธิ์ระดับระบบโดยไม่มีมติใหม่ ไม่ใช่เทสต์พัง
 */
describe('capability locks (`25` §16.1 "✅ only")', () => {
  it('ล็อกครบ 9 รายการ — Superadmin 6 + Executive 3', () => {
    const owners = Object.values(CAPABILITY_LOCKS)
    expect(Object.keys(CAPABILITY_LOCKS)).toHaveLength(LOCKED_CAPABILITY_COUNT)
    expect(owners.filter((owner) => owner === SUPERADMIN_ROLE_NAME)).toHaveLength(6)
    expect(owners.filter((owner) => owner === EXECUTIVE_ROLE_NAME)).toHaveLength(3)
  })

  it('รายการของ Superadmin ตรงตาม `25` §7.1 + `07` §12', () => {
    const superadminOnly = Object.entries(CAPABILITY_LOCKS)
      .filter(([, owner]) => owner === SUPERADMIN_ROLE_NAME)
      .map(([code]) => code)
      .sort()

    expect(superadminOnly).toEqual(
      [
        'manage_companies',
        'manage_invoice_numbering',
        'manage_period_lock_policy',
        'manage_roles',
        'manage_service_fees',
        'manage_tax_profiles',
      ].sort(),
    )
  })

  it('รายการของบริหาร (Executive) ตรงตาม `25` §7.4/§7.5', () => {
    const executiveOnly = Object.entries(CAPABILITY_LOCKS)
      .filter(([, owner]) => owner === EXECUTIVE_ROLE_NAME)
      .map(([code]) => code)
      .sort()

    expect(executiveOnly).toEqual(['approve_adjustment_locked', 'authorize_exception', 'unlock_period'])
  })

  it('capability ทั่วไปไม่ถูกล็อก', () => {
    expect(isCapabilityLocked('manage_billing')).toBe(false)
    expect(capabilityLockOwner('manage_billing')).toBeNull()
    expect(isCapabilityLocked('unlock_period')).toBe(true)
  })

  it('ownsLockedCapability จริงเฉพาะ role เจ้าของ', () => {
    expect(ownsLockedCapability(EXECUTIVE_ROLE_NAME, 'unlock_period')).toBe(true)
    expect(ownsLockedCapability(SUPERADMIN_ROLE_NAME, 'unlock_period')).toBe(false)
    expect(ownsLockedCapability(SUPERADMIN_ROLE_NAME, 'manage_roles')).toBe(true)
    // capability ที่ไม่ถูกล็อก = ไม่มีเจ้าของ
    expect(ownsLockedCapability(SUPERADMIN_ROLE_NAME, 'manage_billing')).toBe(false)
  })
})

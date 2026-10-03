import { describe, expect, it } from 'vitest'
import {
  canChangeOwnRole,
  canManageAccountIn,
  canSetPasswordFor,
  canViewAccountsIn,
  hiddenAccountGroups,
  isEmailAlreadyRegistered,
  mustChangeAfterAdminSet,
} from '@/lib/users/auth-account'

/** ผู้ดูแลตั้ง/รีเซ็ตรหัสผ่านให้ผู้ใช้ — มติ PO 03/10/2569 */

describe('canManageAccountIn / canSetPasswordFor — กลุ่มแอดมินจัดการได้เฉพาะ Superadmin', () => {
  it('Superadmin จัดการ/ตั้งรหัสได้ทุกกลุ่ม', () => {
    for (const group of ['system', 'inhouse', 'outsource', 'finance_company'] as const) {
      expect(canManageAccountIn({ isSuperadmin: true }, group)).toBe(true)
      expect(canSetPasswordFor({ isSuperadmin: true }, { roleGroup: group })).toBe(true)
    }
  })

  it('ผู้ดูแลทั่วไป (เช่น ธุรการ) ตั้งรหัส/สร้าง/ย้ายเข้ากลุ่ม system ไม่ได้ — กันยึดบัญชีบริหาร/การเงิน', () => {
    expect(canManageAccountIn({ isSuperadmin: false }, 'system')).toBe(false)
    expect(canSetPasswordFor({ isSuperadmin: false }, { roleGroup: 'system' })).toBe(false)
  })

  it('ผู้ดูแลทั่วไปจัดการเจ้าหน้าที่ภาคสนามและผู้ใช้บริษัทไฟแนนซ์ได้', () => {
    for (const group of ['inhouse', 'outsource', 'finance_company'] as const) {
      expect(canSetPasswordFor({ isSuperadmin: false }, { roleGroup: group })).toBe(true)
    }
  })
})

describe('canChangeOwnRole', () => {
  it('เปลี่ยน role ตัวเองได้เฉพาะ Superadmin', () => {
    expect(canChangeOwnRole({ isSuperadmin: true })).toBe(true)
    expect(canChangeOwnRole({ isSuperadmin: false })).toBe(false)
  })
})

describe('mustChangeAfterAdminSet', () => {
  it('ตั้งให้คนอื่น = บังคับเปลี่ยนเอง · ตั้งให้ตัวเอง = ไม่บังคับ', () => {
    expect(mustChangeAfterAdminSet('admin', 'agent')).toBe(true)
    expect(mustChangeAfterAdminSet('admin', 'admin')).toBe(false)
  })
})

describe('isEmailAlreadyRegistered', () => {
  it('จับได้ทั้งจาก code และข้อความของ gotrue หลายเวอร์ชัน', () => {
    expect(isEmailAlreadyRegistered({ code: 'email_exists' })).toBe(true)
    expect(isEmailAlreadyRegistered({ code: 'user_already_exists' })).toBe(true)
    expect(isEmailAlreadyRegistered({ message: 'A user with this email address has already been registered' })).toBe(
      true,
    )
  })

  it('error อื่นไม่ถูกตีความว่าอีเมลซ้ำ', () => {
    expect(isEmailAlreadyRegistered({ code: 'weak_password' })).toBe(false)
    expect(isEmailAlreadyRegistered(null)).toBe(false)
  })
})

describe('canViewAccountsIn / hiddenAccountGroups — ธุรการเห็นเฉพาะกลุ่มที่จัดการได้ (UAT BUG-021)', () => {
  const superadmin = { isSuperadmin: true, capabilities: {} }
  const adminOffice = { isSuperadmin: false, capabilities: { manage_users: 'manage' as const } }
  const executive = { isSuperadmin: false, capabilities: { manage_users: 'view' as const } }

  it('ผู้ดูแลบัญชีที่ไม่ใช่ Superadmin ไม่เห็นกลุ่ม system', () => {
    expect(canViewAccountsIn(adminOffice, 'system')).toBe(false)
    expect(canViewAccountsIn(adminOffice, 'inhouse')).toBe(true)
    expect(canViewAccountsIn(adminOffice, 'outsource')).toBe(true)
    expect(canViewAccountsIn(adminOffice, 'finance_company')).toBe(true)
    expect(hiddenAccountGroups(adminOffice)).toEqual(['system'])
  })

  it('Superadmin และผู้ถือแค่ view ไม่ถูกจำกัดกลุ่ม', () => {
    expect(hiddenAccountGroups(superadmin)).toEqual([])
    expect(hiddenAccountGroups(executive)).toEqual([])
  })
})

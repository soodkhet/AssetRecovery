import { describe, expect, it } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import { SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import { RoleError } from '@/lib/roles/errors'
import {
  assertCapabilityAssignable,
  assertRoleDeletable,
  assertRolePermissionsEditable,
  assertRoleRenamable,
  planPermissionChanges,
} from '@/lib/roles/guards'

const seedRole = { name: 'ผู้จัดการทีมติดตามทรัพย์', roleGroup: 'inhouse' as const, isSeed: true, isEditable: false }
const customRole = { name: 'ผู้ตรวจสอบภายใน', roleGroup: 'system' as const, isSeed: false, isEditable: true }
const knownCodes = new Set(['manage_billing', 'view_finance_dashboard', 'unlock_period', 'manage_roles'])

function codeOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    if (error instanceof RoleError || error instanceof AuthError) return error.code
    throw error
  }
  throw new Error('คาดว่าจะโยน error แต่ผ่านไปเฉยๆ')
}

describe('seed role guards (`07` §10/§11/§16)', () => {
  it('เปลี่ยนชื่อ seed role ถูกปฏิเสธด้วย SEED_ROLE_RENAME', () => {
    expect(codeOf(() => assertRoleRenamable(seedRole, 'หัวหน้าทีมใหม่'))).toBe('SEED_ROLE_RENAME')
  })

  it('ส่งชื่อเดิมกลับมา (ไม่เปลี่ยนชื่อ) ไม่ถือว่า rename', () => {
    expect(() => assertRoleRenamable(seedRole, ' ผู้จัดการทีมติดตามทรัพย์ ')).not.toThrow()
  })

  it('เปลี่ยนชื่อ custom role ได้', () => {
    expect(() => assertRoleRenamable(customRole, 'ผู้ตรวจสอบภายใน 2')).not.toThrow()
  })

  it('ลบ seed role ถูกปฏิเสธด้วย SEED_ROLE_DELETE', () => {
    expect(
      codeOf(() => assertRoleDeletable({ role: seedRole, userCount: 0, activeSuperadminCount: 1 })),
    ).toBe('SEED_ROLE_DELETE')
  })

  it('ลบบทบาท Superadmin ที่ยังมีคนใช้ = LAST_SUPERADMIN_REMOVAL (แรงกว่า seed guard)', () => {
    const role = { name: SUPERADMIN_ROLE_NAME, roleGroup: 'system' as const, isSeed: true, isEditable: false }
    expect(codeOf(() => assertRoleDeletable({ role, userCount: 1, activeSuperadminCount: 1 }))).toBe(
      'LAST_SUPERADMIN_REMOVAL',
    )
  })

  it('ลบ custom role ที่ยังมีผู้ใช้ผูกอยู่ = ROLE_IN_USE', () => {
    expect(
      codeOf(() => assertRoleDeletable({ role: customRole, userCount: 3, activeSuperadminCount: 2 })),
    ).toBe('ROLE_IN_USE')
  })

  it('ลบ role ที่อยู่ในสายอนุมัติ = ROLE_IN_USE แม้ไม่มีผู้ใช้ (มติ PO U149)', () => {
    expect(
      codeOf(() =>
        assertRoleDeletable({ role: customRole, userCount: 0, activeSuperadminCount: 2, approvalMatrixCount: 1 }),
      ),
    ).toBe('ROLE_IN_USE')
  })

  it('ลบ custom role ที่ไม่มีผู้ใช้ได้', () => {
    expect(() =>
      assertRoleDeletable({ role: customRole, userCount: 0, activeSuperadminCount: 2 }),
    ).not.toThrow()
  })
})

describe('permission editability (`07` §9 · DEC-009)', () => {
  it('role ที่ is_editable = false แก้สิทธิ์ไม่ได้', () => {
    expect(codeOf(() => assertRolePermissionsEditable(seedRole))).toBe('ROLE_NOT_EDITABLE')
  })

  it('Superadmin แก้สิทธิ์ไม่ได้ (implicit manage ไม่เก็บ record)', () => {
    expect(
      codeOf(() => assertRolePermissionsEditable({ name: SUPERADMIN_ROLE_NAME, roleGroup: 'system' as const, isEditable: true })),
    ).toBe('ROLE_NOT_EDITABLE')
  })

  it('capability ที่ล็อกไว้มอบให้ใครไม่ได้', () => {
    expect(codeOf(() => assertCapabilityAssignable('unlock_period'))).toBe('CAPABILITY_LOCKED')
    expect(codeOf(() => assertCapabilityAssignable('manage_roles'))).toBe('CAPABILITY_LOCKED')
    expect(() => assertCapabilityAssignable('manage_billing')).not.toThrow()
  })
})

describe('planPermissionChanges', () => {
  it('สรุปเฉพาะรายการที่เปลี่ยนจริง (ส่งค่าเดิมซ้ำ = ไม่นับ)', () => {
    const plan = planPermissionChanges(
      customRole,
      { manage_billing: 'view' },
      [
        { capabilityCode: 'manage_billing', level: 'manage' },
        { capabilityCode: 'view_finance_dashboard', level: 'none' },
      ],
      knownCodes,
    )

    expect(plan.changes).toEqual([{ code: 'manage_billing', from: 'view', to: 'manage' }])
    expect(plan.before).toEqual({ manage_billing: 'view' })
    expect(plan.after).toEqual({ manage_billing: 'manage' })
  })

  it('ถอดสิทธิ์ (manage → none) นับเป็นการเปลี่ยน', () => {
    const plan = planPermissionChanges(
      customRole,
      { manage_billing: 'manage' },
      [{ capabilityCode: 'manage_billing', level: 'none' }],
      knownCodes,
    )

    expect(plan.changes).toEqual([{ code: 'manage_billing', from: 'manage', to: 'none' }])
  })

  it('code ที่ไม่มีในระบบ = CAPABILITY_NOT_FOUND', () => {
    expect(
      codeOf(() =>
        planPermissionChanges(customRole, {}, [{ capabilityCode: 'ยิงมั่ว', level: 'view' }], knownCodes),
      ),
    ).toBe('CAPABILITY_NOT_FOUND')
  })

  it('พยายามมอบ capability ที่ล็อก = CAPABILITY_LOCKED', () => {
    expect(
      codeOf(() =>
        planPermissionChanges(customRole, {}, [{ capabilityCode: 'unlock_period', level: 'manage' }], knownCodes),
      ),
    ).toBe('CAPABILITY_LOCKED')
  })

  it('ส่งรายการที่ล็อกมาโดยค่าไม่เปลี่ยน = ผ่าน (idempotent จาก UI ที่ส่งทั้งตาราง)', () => {
    const plan = planPermissionChanges(
      { name: 'บริหาร', roleGroup: 'system' as const, isEditable: true },
      { unlock_period: 'manage' },
      [{ capabilityCode: 'unlock_period', level: 'manage' }],
      knownCodes,
    )

    expect(plan.changes).toHaveLength(0)
  })

  describe('role กลุ่มบริษัทไฟแนนซ์ (is_editable = false) — แก้ได้เฉพาะ portal_* (มติ O43 D1 · staging S-004)', () => {
    const companyRole = { name: 'ผู้จัดการ', roleGroup: 'finance_company' as const, isEditable: false }
    const codes = new Set([...knownCodes, 'portal_cases', 'portal_finance'])

    it('ปรับ portal_cases ได้', () => {
      const plan = planPermissionChanges(companyRole, { portal_cases: 'view' }, [{ capabilityCode: 'portal_cases', level: 'manage' }], codes)
      expect(plan.changes).toEqual([{ code: 'portal_cases', from: 'view', to: 'manage' }])
    })

    it('capability ภายในยังแก้ไม่ได้ = ROLE_NOT_EDITABLE (ทั้งชุดถูกปฏิเสธ)', () => {
      expect(
        codeOf(() =>
          planPermissionChanges(
            companyRole,
            {},
            [
              { capabilityCode: 'portal_finance', level: 'view' },
              { capabilityCode: 'manage_billing', level: 'view' },
            ],
            codes,
          ),
        ),
      ).toBe('ROLE_NOT_EDITABLE')
    })

    it('role ภายในที่ is_editable = false ยังแก้ portal_* ไม่ได้', () => {
      expect(
        codeOf(() => planPermissionChanges(seedRole, {}, [{ capabilityCode: 'portal_cases', level: 'view' }], codes)),
      ).toBe('ROLE_NOT_EDITABLE')
    })
  })
})

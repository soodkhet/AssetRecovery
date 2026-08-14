import { describe, expect, it } from 'vitest'
import { EXECUTIVE_ROLE_NAME, SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import {
  buildRoleMatrix,
  countGrantedLevels,
  isRowEditable,
  resolveLevel,
  type CapabilityInfo,
} from '@/lib/roles/matrix'
import { ROLE_GROUP_TABS, roleGroupsForTab, tabForRoleGroup } from '@/lib/roles/role-groups'

const capabilities: CapabilityInfo[] = [
  { code: 'approve_case', label: 'รับ/ไม่รับเคส', module: 'case', functionalGroup: 'ops', description: null },
  { code: 'manage_billing', label: 'จัดการ Billing', module: 'billing', functionalGroup: 'finance', description: null },
  { code: 'unlock_period', label: 'ปลดล็อกรอบ', module: 'accounting', functionalGroup: 'accounting', description: null },
  { code: 'manage_roles', label: 'จัดการ Role', module: 'role', functionalGroup: 'admin', description: null },
  { code: 'manage_users', label: 'จัดการผู้ใช้', module: 'user', functionalGroup: null, description: null },
]

describe('buildRoleMatrix (DEC-009 · `13` §6.10)', () => {
  it('จัดกลุ่ม 4 กลุ่มตามลำดับ + กลุ่ม "อื่นๆ" ท้ายสุด', () => {
    const sections = buildRoleMatrix({ name: 'การเงิน', isEditable: true }, capabilities, {})
    expect(sections.map((section) => section.id)).toEqual(['ops', 'finance', 'accounting', 'admin', 'other'])
  })

  it('ไม่มี record = none · view/manage อ่านจาก assignments', () => {
    const sections = buildRoleMatrix(
      { name: 'การเงิน', isEditable: true },
      capabilities,
      { manage_billing: 'manage', approve_case: 'view' },
    )
    const rows = sections.flatMap((section) => section.rows)

    expect(rows.find((row) => row.code === 'manage_billing')?.level).toBe('manage')
    expect(rows.find((row) => row.code === 'approve_case')?.level).toBe('view')
    expect(rows.find((row) => row.code === 'manage_users')?.level).toBe('none')
  })

  it('Superadmin = manage ทุกแถวโดยไม่มี record และแก้ไม่ได้', () => {
    const sections = buildRoleMatrix({ name: SUPERADMIN_ROLE_NAME, isEditable: true }, capabilities, {})
    const rows = sections.flatMap((section) => section.rows)

    expect(rows.every((row) => row.level === 'manage')).toBe(true)
    expect(rows.every((row) => row.editable === false)).toBe(true)
  })

  it('แถวที่ถูกล็อกแก้ไม่ได้แม้ role จะ editable + ติดธง lockOwner', () => {
    const sections = buildRoleMatrix({ name: 'ผู้ตรวจสอบ', isEditable: true }, capabilities, {})
    const rows = sections.flatMap((section) => section.rows)

    const locked = rows.find((row) => row.code === 'unlock_period')
    expect(locked?.locked).toBe(true)
    expect(locked?.lockOwner).toBe(EXECUTIVE_ROLE_NAME)
    expect(locked?.editable).toBe(false)

    expect(rows.find((row) => row.code === 'manage_roles')?.lockOwner).toBe(SUPERADMIN_ROLE_NAME)
    expect(rows.find((row) => row.code === 'manage_billing')?.editable).toBe(true)
  })

  it('role ที่ is_editable = false ทุกแถวแก้ไม่ได้', () => {
    expect(isRowEditable({ name: 'การเงิน', isEditable: false }, 'manage_billing')).toBe(false)
  })

  it('resolveLevel/countGrantedLevels สอดคล้องกัน', () => {
    const role = { name: 'บัญชี', isEditable: false }
    const assignments = { manage_billing: 'view', unlock_period: 'manage' } as const

    expect(resolveLevel(role, 'manage_billing', assignments)).toBe('view')
    expect(countGrantedLevels(role, capabilities, assignments)).toEqual({ manage: 1, view: 1 })
    expect(countGrantedLevels({ name: SUPERADMIN_ROLE_NAME, isEditable: false }, capabilities, {})).toEqual({
      manage: capabilities.length,
      view: 0,
    })
  })
})

describe('role group tabs (`07` §8 — 3 tab หลัก)', () => {
  it('มี 3 แท็บ และ inhouse/outsource เป็น sub-toggle ในแท็บเดียว', () => {
    expect(ROLE_GROUP_TABS).toHaveLength(3)
    expect(roleGroupsForTab('field')).toEqual(['inhouse', 'outsource'])
    expect(ROLE_GROUP_TABS.find((tab) => tab.id === 'field')?.hasSubToggle).toBe(true)
  })

  it('role group ทุกตัวถูกจัดลงแท็บครบ', () => {
    expect(tabForRoleGroup('system')).toBe('admin')
    expect(tabForRoleGroup('inhouse')).toBe('field')
    expect(tabForRoleGroup('outsource')).toBe('field')
    expect(tabForRoleGroup('finance_company')).toBe('finance_company')
  })
})

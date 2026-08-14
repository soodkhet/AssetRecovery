import { describe, expect, it } from 'vitest'
import { EXECUTIVE_ROLE_NAME, SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import { CAPABILITIES, CAPABILITY_CODES, MATRIX_CAPABILITIES } from '@/lib/roles/capability-catalog'
import { CAPABILITY_LOCKS, capabilityLockOwner } from '@/lib/roles/capability-locks'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

/**
 * ยามความสอดคล้อง: catalog (`02` §12) ↔ ค่าเริ่มต้นของ matrix (`25` §7) ↔ รายการที่ล็อก (`25` §16.1)
 * เทสต์ชุดนี้แดง = seed กับสเปคเริ่มไม่ตรงกัน ไม่ใช่เทสต์พัง
 */
describe('capability catalog (`02` §12 · `13` §6.10)', () => {
  it('มี 47 capability และอยู่ใน Functional Matrix 37 รายการ 4 กลุ่ม', () => {
    expect(CAPABILITIES).toHaveLength(47)
    expect(MATRIX_CAPABILITIES).toHaveLength(37)
    expect(new Set(MATRIX_CAPABILITIES.map((capability) => capability.functionalGroup)).size).toBe(4)
  })

  it('code ไม่ซ้ำกัน', () => {
    expect(CAPABILITY_CODES.size).toBe(CAPABILITIES.length)
  })

  it('capability ที่ถูกล็อกทุกตัวมีอยู่จริงใน catalog และอยู่ใน matrix', () => {
    for (const code of Object.keys(CAPABILITY_LOCKS)) {
      const capability = CAPABILITIES.find((each) => each.code === code)
      expect(capability, `ไม่พบ capability ${code}`).toBeDefined()
      expect(capability?.functionalGroup).not.toBeNull()
    }
  })
})

describe('ค่าเริ่มต้นของ role_capabilities (`25` §7)', () => {
  it('อ้างถึง capability ที่มีจริงทุกแถว', () => {
    for (const assignment of DEFAULT_ROLE_CAPABILITIES) {
      expect(CAPABILITY_CODES.has(assignment.capabilityCode), assignment.capabilityCode).toBe(true)
    }
  })

  it('ไม่มีแถวของ Superadmin เลย (manage ทุกอย่างโดยนิยาม — DEC-009)', () => {
    expect(DEFAULT_ROLE_CAPABILITIES.some((each) => each.role.name === SUPERADMIN_ROLE_NAME)).toBe(false)
  })

  it('capability ที่ล็อกกับ Superadmin ไม่มี default record', () => {
    const superadminLocked = Object.entries(CAPABILITY_LOCKS)
      .filter(([, owner]) => owner === SUPERADMIN_ROLE_NAME)
      .map(([code]) => code)

    for (const code of superadminLocked) {
      expect(DEFAULT_ROLE_CAPABILITIES.filter((each) => each.capabilityCode === code)).toHaveLength(0)
    }
  })

  it('capability ที่ล็อกกับบริหารมีแถวเดียว = บริหาร (system) ระดับ manage', () => {
    const executiveLocked = Object.entries(CAPABILITY_LOCKS)
      .filter(([, owner]) => owner === EXECUTIVE_ROLE_NAME)
      .map(([code]) => code)

    for (const code of executiveLocked) {
      const rows = DEFAULT_ROLE_CAPABILITIES.filter((each) => each.capabilityCode === code)
      expect(rows, code).toHaveLength(1)
      expect(rows[0]?.role).toEqual({ name: EXECUTIVE_ROLE_NAME, roleGroup: 'system' })
      expect(rows[0]?.level).toBe('manage')
    }
  })

  it('capability ที่ถูกล็อกไม่ถูกมอบให้ role อื่นนอกจากเจ้าของ', () => {
    for (const assignment of DEFAULT_ROLE_CAPABILITIES) {
      const owner = capabilityLockOwner(assignment.capabilityCode)
      if (owner === null) continue
      expect(assignment.role.name, assignment.capabilityCode).toBe(owner)
    }
  })

  it('ทุก capability ใน matrix ที่ไม่ได้ล็อกกับ Superadmin ต้องมีเจ้าของอย่างน้อย 1 role', () => {
    const missing = MATRIX_CAPABILITIES.filter(
      (capability) =>
        capabilityLockOwner(capability.code) !== SUPERADMIN_ROLE_NAME &&
        !DEFAULT_ROLE_CAPABILITIES.some((each) => each.capabilityCode === capability.code),
    ).map((capability) => capability.code)

    expect(missing).toEqual([])
  })

  it('capability นอก matrix ยังไม่ถูกผูก (เป็นงานของโมดูลเจ้าของสิทธิ์)', () => {
    const outsideMatrix = new Set(
      CAPABILITIES.filter((capability) => capability.functionalGroup === null).map((each) => each.code),
    )
    const bound = DEFAULT_ROLE_CAPABILITIES.filter((each) => outsideMatrix.has(each.capabilityCode))
    expect(bound).toEqual([])
  })

  it('role ชื่อซ้ำข้าม group ได้สิทธิ์แยกกันคนละแถว (`07` §6 — คนละ record จริง)', () => {
    const assignCase = DEFAULT_ROLE_CAPABILITIES.filter((each) => each.capabilityCode === 'assign_case')
    const groups = assignCase
      .filter((each) => each.role.name === 'ผู้จัดการทีมติดตามทรัพย์')
      .map((each) => each.role.roleGroup)
      .sort()

    expect(groups).toEqual(['inhouse', 'outsource'])
  })

  it('ไม่มีคู่ (role, capability) ซ้ำ — กัน upsert ชนกันตอน seed', () => {
    const keys = DEFAULT_ROLE_CAPABILITIES.map(
      (each) => `${each.role.roleGroup}::${each.role.name}::${each.capabilityCode}`,
    )
    expect(new Set(keys).size).toBe(keys.length)
  })
})

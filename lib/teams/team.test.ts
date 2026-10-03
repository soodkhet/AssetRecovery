import { describe, expect, it } from 'vitest'
import { isTeamError } from '@/lib/teams/errors'
import { isKnownProvince, PROVINCE_DATA, PROVINCE_LIST, provinceRegion, unknownProvinces } from '@/lib/teams/provinces'
import {
  ACTIVE_CASE_STATUSES,
  assertProvincesKnown,
  assertSupervisorAvailable,
  assertTeamDeactivatable,
  assertTeamMembersEligible,
  diffManagers,
  normalizeTeamValues,
  toTeamAuditPayload,
  type TeamValues,
  assertTeamSideConsistent,
  isTeamSlotEligible,
} from '@/lib/teams/team'

/** เทสต์ pure logic ของทีม (`09` §16) — ไม่มีการแตะ DB ในไฟล์นี้ */

const baseValues: TeamValues = {
  name: '  ทีมกรุงเทพ 1  ',
  side: 'inhouse',
  compensationPlanId: 'plan-1',
  supervisorId: 'user-sup',
  managerIds: ['user-a', 'user-a', ' user-b ', ''],
  provinces: ['กรุงเทพมหานคร', 'กรุงเทพมหานคร', ' นนทบุรี '],
  status: 'active',
}

function codeOf(fn: () => void): string {
  try {
    fn()
  } catch (error) {
    if (isTeamError(error)) return error.code
    throw error
  }
  return 'NO_ERROR'
}

describe('normalizeTeamValues', () => {
  it('ตัดช่องว่าง + ลบค่าซ้ำของผู้จัดการและจังหวัด โดยคงลำดับเดิม', () => {
    const result = normalizeTeamValues(baseValues)
    expect(result.name).toBe('ทีมกรุงเทพ 1')
    expect(result.managerIds).toEqual(['user-a', 'user-b'])
    expect(result.provinces).toEqual(['กรุงเทพมหานคร', 'นนทบุรี'])
  })

  it('supervisor ที่เป็นสตริงว่างถือว่าไม่มีหัวหน้าทีม (ไม่ใช่ค่าว่างใน DB)', () => {
    expect(normalizeTeamValues({ ...baseValues, supervisorId: '' }).supervisorId).toBeNull()
  })
})

describe('จังหวัด (PROVINCE_DATA — `09` §8)', () => {
  it('จังหวัดที่อยู่ 2 ภาคถูกนับครั้งเดียวใน PROVINCE_LIST', () => {
    const flat = PROVINCE_DATA.flatMap((region) => region.provinces)
    expect(flat.length).toBeGreaterThan(PROVINCE_LIST.length)
    expect(new Set(PROVINCE_LIST).size).toBe(PROVINCE_LIST.length)
    expect(provinceRegion('ราชบุรี')).toBe('ภาคกลาง')
  })

  it('จังหวัดนอกรายการถูกปฏิเสธด้วย INVALID_PROVINCE', () => {
    expect(isKnownProvince('กรุงเทพมหานคร')).toBe(true)
    expect(isKnownProvince('เมืองสมมติ')).toBe(false)
    expect(unknownProvinces(['กรุงเทพมหานคร', 'เมืองสมมติ'])).toEqual(['เมืองสมมติ'])
    expect(codeOf(() => assertProvincesKnown(['กรุงเทพมหานคร', 'เมืองสมมติ']))).toBe('INVALID_PROVINCE')
    expect(codeOf(() => assertProvincesKnown(['กรุงเทพมหานคร']))).toBe('NO_ERROR')
  })
})

describe('assertTeamMembersEligible (`09` §7.1)', () => {
  const candidates = [
    { id: 'u-inhouse', status: 'active', roleGroup: 'inhouse' },
    { id: 'u-outsource', status: 'active', roleGroup: 'outsource' },
    { id: 'u-suspended', status: 'suspended', roleGroup: 'inhouse' },
    { id: 'u-system', status: 'active', roleGroup: 'system' },
  ]

  it('ผ่านเมื่อทุกคน active และอยู่กลุ่ม inhouse/outsource', () => {
    expect(codeOf(() => assertTeamMembersEligible(['u-inhouse', 'u-outsource'], candidates))).toBe('NO_ERROR')
  })

  it('ปฏิเสธ user ที่ถูกระงับ / อยู่กลุ่ม system / ไม่มีตัวตน', () => {
    expect(codeOf(() => assertTeamMembersEligible(['u-suspended'], candidates))).toBe('INVALID_TEAM_MEMBER')
    expect(codeOf(() => assertTeamMembersEligible(['u-system'], candidates))).toBe('INVALID_TEAM_MEMBER')
    expect(codeOf(() => assertTeamMembersEligible(['u-ไม่มีจริง'], candidates))).toBe('INVALID_TEAM_MEMBER')
  })
})

describe('หัวหน้าทีม 1 คน = 1 ทีม (`09` §7.1/§17)', () => {
  it('ตั้งหัวหน้าที่ยังว่างได้', () => {
    expect(codeOf(() => assertSupervisorAvailable('u1', null, null))).toBe('NO_ERROR')
  })

  it('บันทึกทีมเดิมซ้ำได้ ไม่ชนตัวเอง', () => {
    expect(codeOf(() => assertSupervisorAvailable('u1', 'team-1', 'team-1'))).toBe('NO_ERROR')
  })

  it('ปฏิเสธเมื่อ user เป็นหัวหน้าของอีกทีมอยู่แล้ว', () => {
    expect(codeOf(() => assertSupervisorAvailable('u1', 'team-1', 'team-2'))).toBe('SUPERVISOR_ALREADY_ASSIGNED')
    expect(codeOf(() => assertSupervisorAvailable('u1', 'team-1', null))).toBe('SUPERVISOR_ALREADY_ASSIGNED')
  })
})

describe('assertTeamDeactivatable (`09` §10 · D7)', () => {
  it('ทีมที่ไม่มีเคสค้างปิดได้', () => {
    expect(codeOf(() => assertTeamDeactivatable(0))).toBe('NO_ERROR')
  })

  it('ทีมที่ยังมีเคสค้างปิดไม่ได้', () => {
    expect(codeOf(() => assertTeamDeactivatable(3))).toBe('TEAM_HAS_ACTIVE_CASES')
  })

  it('สถานะที่ถือว่าเคสยังไม่จบไม่รวมเคสที่ปิด/ถูกปฏิเสธ/ยังเป็นร่าง', () => {
    expect(ACTIVE_CASE_STATUSES).not.toContain('closed_success')
    expect(ACTIVE_CASE_STATUSES).not.toContain('closed_fail')
    expect(ACTIVE_CASE_STATUSES).not.toContain('rejected')
    expect(ACTIVE_CASE_STATUSES).not.toContain('draft')
  })
})

describe('diffManagers (N:N `team_managers`)', () => {
  it('คืนเฉพาะส่วนต่าง ไม่ลบทั้งชุดแล้วใส่ใหม่', () => {
    expect(diffManagers(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] })
    expect(diffManagers(['a'], ['a'])).toEqual({ added: [], removed: [] })
    expect(diffManagers([], ['a', 'a'])).toEqual({ added: ['a'], removed: [] })
  })
})

describe('toTeamAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case และแนบ manager_ids มาด้วย (junction ไม่มี audit ของตัวเอง)', () => {
    expect(toTeamAuditPayload(baseValues)).toEqual({
      name: 'ทีมกรุงเทพ 1',
      side: 'inhouse',
      compensation_plan_id: 'plan-1',
      supervisor_id: 'user-sup',
      manager_ids: ['user-a', 'user-b'],
      provinces: ['กรุงเทพมหานคร', 'นนทบุรี'],
      status: 'active',
    })
  })
})

describe('ทีม/แผน/หัวหน้า/ผู้จัดการฝั่งเดียวกัน (มติ PO 03/10/2569 UAT Q12 · BUG-009)', () => {
  const supIn = { id: 's-in', roleGroup: 'inhouse', roleName: 'หัวหน้าทีมติดตามทรัพย์' }
  const supOut = { id: 's-out', roleGroup: 'outsource', roleName: 'หัวหน้าทีมติดตามทรัพย์' }
  const mgrIn = { id: 'm-in', roleGroup: 'inhouse', roleName: 'ผู้จัดการทีมติดตามทรัพย์' }
  const agentIn = { id: 'a-in', roleGroup: 'inhouse', roleName: 'พนักงานติดตามทรัพย์' }

  function errorOf(run: () => void): { code?: string; context?: { fields?: Record<string, string> } } {
    try {
      run()
    } catch (error) {
      expect(isTeamError(error)).toBe(true)
      return error as { code?: string; context?: { fields?: Record<string, string> } }
    }
    throw new Error('ต้อง throw')
  }

  it('role ต้องตรงช่อง และ role group ต้องตรงฝั่งทีม', () => {
    expect(isTeamSlotEligible(supIn, 'supervisor', 'inhouse')).toBe(true)
    expect(isTeamSlotEligible(supOut, 'supervisor', 'inhouse')).toBe(false)
    expect(isTeamSlotEligible(mgrIn, 'supervisor', 'inhouse')).toBe(false)
    expect(isTeamSlotEligible(agentIn, 'manager', 'inhouse')).toBe(false)
    expect(isTeamSlotEligible(mgrIn, 'manager', 'inhouse')).toBe(true)
  })

  it('ฝั่งตรงกันทั้งหมด = ผ่าน', () => {
    expect(() =>
      assertTeamSideConsistent({ side: 'inhouse', planSide: 'inhouse', supervisor: supIn, managers: [mgrIn] }),
    ).not.toThrow()
  })

  it('แผนคนละฝั่ง = 400 REQUIRED_MISSING + field error compensationPlanId', () => {
    const error = errorOf(() =>
      assertTeamSideConsistent({ side: 'inhouse', planSide: 'outsource', supervisor: null, managers: [] }),
    )
    expect(error.code).toBe('REQUIRED_MISSING')
    expect(error.context?.fields?.compensationPlanId).toBeDefined()
  })

  it('หัวหน้าคนละฝั่ง / ผู้จัดการเป็นพนักงาน = INVALID_TEAM_MEMBER + field error ของช่องนั้น', () => {
    const supervisor = errorOf(() =>
      assertTeamSideConsistent({ side: 'inhouse', planSide: null, supervisor: supOut, managers: [] }),
    )
    expect(supervisor.code).toBe('INVALID_TEAM_MEMBER')
    expect(supervisor.context?.fields?.supervisorId).toBeDefined()

    const managers = errorOf(() =>
      assertTeamSideConsistent({ side: 'inhouse', planSide: null, supervisor: null, managers: [mgrIn, agentIn] }),
    )
    expect(managers.code).toBe('INVALID_TEAM_MEMBER')
    expect(managers.context?.fields?.managerIds).toBeDefined()
  })
})

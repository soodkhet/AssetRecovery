import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import {
  ACCOUNTING_ROLE_NAME,
  ADMIN_OFFICE_ROLE_NAME,
  CASE_APPROVER_ROLE_NAME,
  EXECUTIVE_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
  FINANCE_ROLE_NAME,
  SUPERADMIN_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'
import {
  canViewMenu,
  findMenu,
  MENU_ITEMS,
  type MenuAudience,
  type MenuViewer,
  resolveMenuAudience,
  visibleMenus,
} from '@/lib/nav/menu-registry'

/**
 * ยามของ `06` §7.2 (Top Nav Visibility Matrix) + §7.1.1 (Role Group × Menu Visibility)
 * เทสต์ในไฟล์นี้ = ตารางในเอกสารถอดมาตรง ๆ — แดง = โค้ดหลุด spec ไม่ใช่เทสต์พัง
 */

function viewer(roleName: string, roleGroup: RoleGroup, isSuperadmin = false): MenuViewer {
  return { isSuperadmin, roleGroup, roleName }
}

/** ผู้ใช้ตัวแทนของแต่ละคอลัมน์ใน matrix */
const VIEWERS: Record<MenuAudience, MenuViewer> = {
  superadmin: viewer(SUPERADMIN_ROLE_NAME, 'system', true),
  executive: viewer(EXECUTIVE_ROLE_NAME, 'system'),
  finance: viewer(FINANCE_ROLE_NAME, 'system'),
  accounting: viewer(ACCOUNTING_ROLE_NAME, 'system'),
  case_approver: viewer(CASE_APPROVER_ROLE_NAME, 'system'),
  admin_office: viewer(ADMIN_OFFICE_ROLE_NAME, 'system'),
  team_lead: viewer(TEAM_MANAGER_ROLE_NAME, 'inhouse'),
  field_agent: viewer(FIELD_AGENT_ROLE_NAME, 'inhouse'),
  company_user: viewer('ผู้จัดการ', 'finance_company'),
}

/** `06` §7.2 — ✅ ในตารางเท่านั้น (ธุรการไม่มีในตาราง §7.2 → ยึด mockup `app-shell.html`) */
const TOP_NAV_MATRIX: Record<MenuAudience, readonly string[]> = {
  superadmin: ['dashboard', 'cases', 'finance', 'accounting', 'warehouse', 'reports', 'settings'],
  executive: ['dashboard', 'cases', 'finance', 'accounting', 'warehouse', 'reports', 'settings'],
  finance: ['dashboard', 'finance', 'warehouse', 'reports'],
  accounting: ['dashboard', 'accounting', 'warehouse', 'reports'],
  case_approver: ['dashboard', 'cases'],
  admin_office: ['dashboard', 'cases'],
  team_lead: ['dashboard', 'cases', 'warehouse', 'reports'],
  field_agent: ['dashboard', 'cases'],
  company_user: ['dashboard', 'cases', 'warehouse'],
}

/** `06` §7.1.1 — sub-menu ของ "จัดการเคส" */
const CASE_SUBMENU_MATRIX: Record<MenuAudience, readonly string[]> = {
  superadmin: ['cases.submit', 'cases.assign', 'cases.field'],
  executive: ['cases.submit', 'cases.assign', 'cases.field'],
  finance: [],
  accounting: [],
  case_approver: ['cases.submit'],
  admin_office: ['cases.submit'],
  team_lead: ['cases.assign'],
  field_agent: ['cases.field'],
  company_user: [],
}

describe('resolveMenuAudience', () => {
  it.each(Object.keys(VIEWERS) as MenuAudience[])('%s → คอลัมน์ตัวเอง', (audience) => {
    expect(resolveMenuAudience(VIEWERS[audience])).toBe(audience)
  })

  it('role เดียวกันคนละ role group ให้ผลเดียวกัน (inhouse/outsource แยก record แต่เห็นเมนูเหมือนกัน)', () => {
    expect(resolveMenuAudience(viewer(TEAM_MANAGER_ROLE_NAME, 'outsource'))).toBe('team_lead')
    expect(resolveMenuAudience(viewer(TEAM_SUPERVISOR_ROLE_NAME, 'outsource'))).toBe('team_lead')
    expect(resolveMenuAudience(viewer(FIELD_AGENT_ROLE_NAME, 'outsource'))).toBe('field_agent')
  })

  it('หัวหน้าทีมอยู่คอลัมน์เดียวกับผู้จัดการ (Manager / Supervisor ใน §7.2)', () => {
    expect(resolveMenuAudience(viewer(TEAM_SUPERVISOR_ROLE_NAME, 'inhouse'))).toBe('team_lead')
  })

  it('custom role (ยังไม่ผูก capability — Phase 1.6) → null = เห็นเฉพาะเมนูที่ทุกคนเห็น', () => {
    const custom = viewer('ผู้ช่วยพิเศษ', 'system')
    expect(resolveMenuAudience(custom)).toBeNull()
    expect(visibleMenus(custom).map((item) => item.id)).toEqual(['dashboard'])
  })

  it('ชื่อ role ของกลุ่มบริษัทไฟแนนซ์ทุกตัวตกคอลัมน์ company_user', () => {
    for (const name of ['ผู้จัดการ', 'หัวหน้า', 'แอดมิน']) {
      expect(resolveMenuAudience(viewer(name, 'finance_company'))).toBe('company_user')
    }
  })
})

describe('visibleMenus — Top Nav Visibility Matrix (`06` §7.2)', () => {
  it.each(Object.keys(TOP_NAV_MATRIX) as MenuAudience[])('%s เห็นเมนูตรงตามตาราง', (audience) => {
    expect(visibleMenus(VIEWERS[audience]).map((item) => item.id)).toEqual(TOP_NAV_MATRIX[audience])
  })

  it('การเงิน/บัญชี ไม่เห็น "จัดการเคส" และไม่เห็น "การตั้งค่า"', () => {
    for (const audience of ['finance', 'accounting'] as const) {
      expect(canViewMenu(VIEWERS[audience], 'cases')).toBe(false)
      expect(canViewMenu(VIEWERS[audience], 'settings')).toBe(false)
    }
  })

  it('มีเฉพาะ Superadmin/บริหาร ที่เห็น "การตั้งค่า"', () => {
    const seeSettings = (Object.keys(VIEWERS) as MenuAudience[]).filter((audience) =>
      canViewMenu(VIEWERS[audience], 'settings'),
    )
    expect(seeSettings).toEqual(['superadmin', 'executive'])
  })

  it('ทุก role เห็น "แดชบอร์ด"', () => {
    for (const audience of Object.keys(VIEWERS) as MenuAudience[]) {
      expect(canViewMenu(VIEWERS[audience], 'dashboard')).toBe(true)
    }
  })

  it('Field Agent ไม่เห็น "คลังสินค้า"/"รายงาน" (`06` §7.2)', () => {
    expect(canViewMenu(VIEWERS.field_agent, 'warehouse')).toBe(false)
    expect(canViewMenu(VIEWERS.field_agent, 'reports')).toBe(false)
  })
})

describe('sub-menu "จัดการเคส" — Role Group Matrix (`06` §7.1.1)', () => {
  it.each(Object.keys(CASE_SUBMENU_MATRIX) as MenuAudience[])('%s เห็นแท็บย่อยตรงตามตาราง', (audience) => {
    const cases = visibleMenus(VIEWERS[audience]).find((item) => item.id === 'cases')
    const children = cases?.children ?? []
    expect(children.map((child) => child.id)).toEqual(CASE_SUBMENU_MATRIX[audience])
  })

  it('Case Approver ต้องไม่เห็น "ติดตามภาคสนาม" เลย (`06` §16 Role Group menu isolation)', () => {
    expect(canViewMenu(VIEWERS.case_approver, 'cases.field')).toBe(false)
    expect(canViewMenu(VIEWERS.case_approver, 'cases.assign')).toBe(false)
    expect(canViewMenu(VIEWERS.case_approver, 'cases.submit')).toBe(true)
  })

  it('Field Agent เห็นเฉพาะ "ติดตามภาคสนาม"', () => {
    expect(canViewMenu(VIEWERS.field_agent, 'cases.field')).toBe(true)
    expect(canViewMenu(VIEWERS.field_agent, 'cases.submit')).toBe(false)
  })

  it('"ติดตามภาคสนาม" ชี้ไปที่ shell ของ Field Tracker (ไฟล์ 41 — mobile-first ไม่ใช่ top nav ปกติ)', () => {
    expect(findMenu('cases.field')?.path).toBe('/field')
  })

  it('canViewMenu ปฏิเสธ id ที่ไม่มีจริง', () => {
    expect(canViewMenu(VIEWERS.superadmin, 'ไม่มีเมนูนี้')).toBe(false)
    expect(canViewMenu(VIEWERS.superadmin, 'cases.unknown')).toBe(false)
    expect(findMenu('cases.unknown')).toBeNull()
  })
})

describe('ความสอดคล้องของ registry', () => {
  it('เมนูหลักครบ 7 ตัวตามชื่อในเอกสาร (`06` §8)', () => {
    expect(MENU_ITEMS.map((item) => item.label)).toEqual([
      'แดชบอร์ด',
      'จัดการเคส',
      'การเงิน',
      'บัญชี',
      'คลังสินค้า',
      'รายงาน',
      'การตั้งค่า',
    ])
  })

  it('id ไม่ซ้ำและ path ขึ้นต้นด้วย `/`', () => {
    const ids = MENU_ITEMS.flatMap((item) => [item.id, ...(item.children ?? []).map((child) => child.id)])
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of MENU_ITEMS) {
      expect(item.path.startsWith('/')).toBe(true)
      for (const child of item.children ?? []) expect(child.path.startsWith('/')).toBe(true)
    }
  })

  it('แท็บย่อยต้องไม่กว้างกว่าเมนูแม่ (เห็นแท็บแต่ไม่เห็นเมนู = บั๊ก)', () => {
    for (const item of MENU_ITEMS) {
      for (const child of item.children ?? []) {
        for (const audience of child.audiences) {
          expect(item.audiences).toContain(audience)
        }
      }
    }
  })

  it('ชื่อ role ที่ใช้กรองเมนูต้องมีอยู่จริงใน seed (กันพิมพ์ผิด/ชื่อ role เปลี่ยน)', () => {
    const seed = readFileSync(new URL('../../prisma/seed.ts', import.meta.url), 'utf8')
    const names = [
      SUPERADMIN_ROLE_NAME,
      EXECUTIVE_ROLE_NAME,
      FINANCE_ROLE_NAME,
      ACCOUNTING_ROLE_NAME,
      CASE_APPROVER_ROLE_NAME,
      ADMIN_OFFICE_ROLE_NAME,
      TEAM_MANAGER_ROLE_NAME,
      TEAM_SUPERVISOR_ROLE_NAME,
      FIELD_AGENT_ROLE_NAME,
    ]
    for (const name of names) {
      expect(seed, `ไม่พบ role "${name}" ใน prisma/seed.ts`).toContain(`name: '${name}'`)
    }
  })
})

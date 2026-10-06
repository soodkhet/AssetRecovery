import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  firstVisibleChildPath,
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

/** `06` §7.2 — ✅/🔸/🔹 ในตาราง (คอลัมน์ธุรการเพิ่มใน v2.3 — มติ PO 03/10/2569) */
const TOP_NAV_MATRIX: Record<MenuAudience, readonly string[]> = {
  superadmin: ['dashboard', 'cases', 'finance', 'accounting', 'warehouse', 'reports', 'settings'],
  executive: ['dashboard', 'cases', 'finance', 'accounting', 'warehouse', 'reports', 'settings'],
  // `06` §7.2 v1.2 (D17) — การเงิน/บัญชีเห็น "การตั้งค่า" แบบบางส่วน (เฉพาะ 2 แท็บอ่านอย่างเดียว)
  finance: ['dashboard', 'finance', 'warehouse', 'reports', 'settings'],
  accounting: ['dashboard', 'accounting', 'warehouse', 'reports', 'settings'],
  case_approver: ['dashboard', 'cases'],
  // มติ PO 03/10/2569 (UAT BUG-021) — "การตั้งค่า" เฉพาะแท็บผู้ใช้งาน
  admin_office: ['dashboard', 'cases', 'warehouse', 'settings'],
  team_lead: ['dashboard', 'cases', 'warehouse', 'reports'],
  field_agent: ['dashboard', 'cases'],
  // `06` v2.6 — ผู้ใช้บริษัทใช้พอร์ทัลทางเดียว ไม่เห็นเมนูภายในใดเลย (มติ PO 05/10/2569 O43 D2)
  company_user: [],
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

  it('การเงิน/บัญชี ไม่เห็น "จัดการเคส"', () => {
    for (const audience of ['finance', 'accounting'] as const) {
      expect(canViewMenu(VIEWERS[audience], 'cases')).toBe(false)
    }
  })

  /**
   * `06` §7.2 v1.2 (มติ PO 15/08/2569 — D17): `90` §12 / `91` §12 ให้การเงิน/บัญชีดู
   * บันทึกการใช้งาน + งานเบื้องหลังได้ ⇒ เห็นเมนู "การตั้งค่า" เฉพาะสองแท็บนี้เท่านั้น
   * แท็บที่ตั้งค่าจริง (สิทธิ์/ผู้ใช้/แผนค่าตอบแทน/…) ยังเป็นของ Superadmin+บริหาร
   */
  it('การเงิน/บัญชี เห็น "การตั้งค่า" เฉพาะแท็บอ่านอย่างเดียว (บัญชีเห็นข้อมูลองค์กรเพิ่ม — มติ PO U99)', () => {
    for (const audience of ['finance', 'accounting'] as const) {
      const settings = visibleMenus(VIEWERS[audience]).find((item) => item.id === 'settings')
      expect(settings?.children?.map((child) => child.id)).toEqual(
        audience === 'accounting'
          ? ['settings.organization', 'settings.audit-logs', 'settings.jobs']
          : ['settings.audit-logs', 'settings.jobs'],
      )
      expect(canViewMenu(VIEWERS[audience], 'settings.audit-logs')).toBe(true)
      expect(canViewMenu(VIEWERS[audience], 'settings.jobs')).toBe(true)
      expect(canViewMenu(VIEWERS[audience], 'settings.roles')).toBe(false)
      expect(canViewMenu(VIEWERS[audience], 'settings.users')).toBe(false)
    }
  })

  it('มีเฉพาะ Superadmin/บริหาร/การเงิน/บัญชี/ธุรการ ที่เห็น "การตั้งค่า"', () => {
    const seeSettings = (Object.keys(VIEWERS) as MenuAudience[]).filter((audience) =>
      canViewMenu(VIEWERS[audience], 'settings'),
    )
    expect(seeSettings).toEqual(['superadmin', 'executive', 'finance', 'accounting', 'admin_office'])
  })

  /** มติ PO 03/10/2569 (UAT BUG-021) — ธุรการถือ `manage:manage_users` แต่แท็บตั้งค่าอื่นยังห้าม (ซ่อน ไม่ใช่ disable) */
  it('ธุรการเห็น "การตั้งค่า" เฉพาะแท็บผู้ใช้งาน', () => {
    const settings = visibleMenus(VIEWERS.admin_office).find((item) => item.id === 'settings')
    expect(settings?.children?.map((child) => child.id)).toEqual(['settings.users'])
    expect(canViewMenu(VIEWERS.admin_office, 'settings.users')).toBe(true)
    for (const other of [
      'settings.roles',
      'settings.organization',
      'settings.compensation',
      'settings.service-fee',
      'settings.teams',
      'settings.companies',
      'settings.finance',
      'settings.audit-logs',
      'settings.jobs',
    ]) {
      expect(canViewMenu(VIEWERS.admin_office, other), other).toBe(false)
    }
    expect(firstVisibleChildPath(VIEWERS.admin_office, 'settings')).toBe('/settings/users')
  })

  /** มติ PO 05/10/2569 U59 — ธุรการที่ถือ `view_client_portal_as` เห็นแท็บบริษัทไฟแนนซ์ (ทางเข้าปุ่มเปิด portal ของลูกค้า) */
  it('ธุรการที่ถือสิทธิ์ดูพอร์ทัลในฐานะลูกค้าเห็นแท็บบริษัทไฟแนนซ์เพิ่ม — role อื่นไม่เปลี่ยน', () => {
    const withCapability: MenuViewer = { ...VIEWERS.admin_office, capabilities: { view_client_portal_as: 'view' } }
    const settings = visibleMenus(withCapability).find((item) => item.id === 'settings')
    expect(settings?.children?.map((child) => child.id)).toEqual(['settings.users', 'settings.companies'])
    expect(canViewMenu(withCapability, 'settings.companies')).toBe(true)
    // ประตูนี้ใช้กับธุรการเท่านั้น — การเงิน/บัญชีถือสิทธิ์เดียวกันก็ไม่เห็นแท็บ (ตามตาราง `06` §7.2)
    expect(canViewMenu({ ...VIEWERS.finance, capabilities: { view_client_portal_as: 'view' } }, 'settings.companies')).toBe(false)
    expect(canViewMenu(VIEWERS.executive, 'settings.companies')).toBe(true)
  })

  /** มติ PO 06/10/2569 U93 — ปฏิทินวันหยุด: การเงิน/บัญชี/ธุรการที่ถือ `manage_holidays` เข้า "ตั้งค่าบัญชี/การเงิน" ได้ */
  it('การเงิน/บัญชี/ธุรการที่ถือสิทธิ์ปฏิทินวันหยุดเห็นแท็บตั้งค่าบัญชี/การเงิน — ไม่ถือก็ไม่เห็น', () => {
    for (const audience of ['finance', 'accounting', 'admin_office'] as const) {
      expect(canViewMenu(VIEWERS[audience], 'settings.finance'), audience).toBe(false)
      const holder: MenuViewer = { ...VIEWERS[audience], capabilities: { manage_holidays: 'manage' } }
      expect(canViewMenu(holder, 'settings.finance'), audience).toBe(true)
    }
    expect(canViewMenu({ ...VIEWERS.case_approver, capabilities: { manage_holidays: 'manage' } }, 'settings.finance')).toBe(
      false,
    )
    expect(canViewMenu(VIEWERS.executive, 'settings.finance')).toBe(true)
  })

  /** `/settings` ไม่มีเนื้อหาของตัวเอง — ต้องพาไปแท็บแรก**ที่ผู้ใช้เห็น** ไม่ใช่ `/settings/roles` ตายตัว */
  it('แท็บแรกของ "การตั้งค่า" ต่างกันตาม role', () => {
    expect(firstVisibleChildPath(VIEWERS.superadmin, 'settings')).toBe('/settings/roles')
    expect(firstVisibleChildPath(VIEWERS.finance, 'settings')).toBe('/settings/audit-logs')
    expect(firstVisibleChildPath(VIEWERS.accounting, 'settings')).toBe('/settings/organization') // มติ PO U99 — บัญชีดูข้อมูลองค์กรได้
    expect(firstVisibleChildPath(VIEWERS.field_agent, 'settings')).toBeNull()
  })

  it('ทุก role ภายในเห็น "แดชบอร์ด" · ผู้ใช้บริษัทไม่เห็นเมนูภายในใดเลย (`06` v2.6)', () => {
    for (const audience of Object.keys(VIEWERS) as MenuAudience[]) {
      expect(canViewMenu(VIEWERS[audience], 'dashboard')).toBe(audience !== 'company_user')
    }
    expect(visibleMenus(VIEWERS.company_user)).toEqual([])
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

  /**
   * Final Test ด่าน 5 (Phase 8.3) — เมนู `จัดการเคส`/`มอบหมายงาน`/`ติดตามภาคสนาม`/การเงิน/บัญชี/
   * คลังสินค้า/รายงาน ค้างที่ `available:false` หลังเฟสของตัวเองปิดไปนาน ⇒ ผู้ใช้เข้าไม่ถึงหน้าที่
   * ทำเสร็จแล้ว (`/cases` เด้ง `ModulePlaceholder`, แท็บย่อยเป็น span กดไม่ได้)
   * เทียบกับไฟล์ `page.tsx` จริงใต้ `app/` เพื่อไม่ให้ต้องอาศัยความจำของคนอีก
   */
  it('ทุกเมนูที่มีหน้าจริงใน `app/` ต้อง `available: true` (กันธงค้างหลังปิดเฟส)', () => {
    const appDir = fileURLToPath(new URL('../../app', import.meta.url))
    const routes = new Set(
      globSync('**/page.tsx', { cwd: appDir }).map((file) => {
        const segments = file
          .slice(0, -'/page.tsx'.length)
          .split('/')
          // route group `(app)` ไม่ปรากฏบน URL
          .filter((segment) => segment !== '' && !segment.startsWith('('))
        return `/${segments.join('/')}`
      }),
    )
    // ยามของยาม — ถ้า glob พังจนไม่เจอหน้าเลย เทสต์นี้จะผ่านฟรี
    expect(routes.size).toBeGreaterThan(20)

    const withRealPage = MENU_ITEMS.flatMap((item) => [item, ...(item.children ?? [])]).filter((item) =>
      routes.has(item.path),
    )
    expect(withRealPage.filter((item) => !item.available).map((item) => item.id)).toEqual([])
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

/**
 * `06` §7.2 v2.5 — มติ PO 03/10/2569 (UAT R6-A): ผู้จัดการ/หัวหน้าทีมเห็นเมนู "การเงิน" **เฉพาะเมื่อเป็น
 * ผู้อนุมัติค่าตอบแทนตาม matrix** (แท็บข้างในเหลือคิวอนุมัติค่าตอบแทนอย่างเดียว — `operation-tabs.test.ts`)
 */
describe('เมนูการเงินของผู้จัดการทีม (UAT R6-A)', () => {
  it('ผู้จัดการที่ถือ approve_expense_manager ⇒ เห็นเมนูการเงิน', () => {
    for (const roleGroup of ['inhouse', 'outsource'] as const) {
      const manager = {
        ...viewer(TEAM_MANAGER_ROLE_NAME, roleGroup),
        capabilities: { approve_expense_manager: 'manage' as const },
      }
      expect(canViewMenu(manager, 'finance')).toBe(true)
    }
  })

  it('หัวหน้าทีม/ผู้จัดการที่ไม่ได้เป็นผู้อนุมัติ ⇒ ไม่เห็นเมนูการเงิน (hide)', () => {
    expect(canViewMenu({ ...viewer(TEAM_SUPERVISOR_ROLE_NAME, 'inhouse'), capabilities: {} }, 'finance')).toBe(false)
    expect(canViewMenu(viewer(TEAM_MANAGER_ROLE_NAME, 'inhouse'), 'finance')).toBe(false)
  })

  it('มติ PO U40 — ธุรการที่ถือ manage_customer_wht เห็นเมนูการเงิน · ไม่ถือ = ไม่เห็น', () => {
    expect(canViewMenu({ ...VIEWERS.admin_office, capabilities: { manage_customer_wht: 'manage' } }, 'finance')).toBe(true)
    expect(canViewMenu({ ...VIEWERS.admin_office, capabilities: { record_admin_data: 'manage' } }, 'finance')).toBe(false)
  })

  it('ประตู capability ไม่กระทบ role อื่น — การเงิน/บริหารเห็นตามเดิมแม้ไม่ส่ง capability', () => {
    expect(canViewMenu(VIEWERS.finance, 'finance')).toBe(true)
    expect(canViewMenu(VIEWERS.executive, 'finance')).toBe(true)
  })
})

/**
 * มติ PO 06/10/2569 U104 (`06` §7.2 v2.11) — เมนูบัญชีมีเมนูย่อย "งานบัญชี" + "ตัวอย่างเอกสารทั้งหมด"
 * · ตัวอย่างเอกสารเห็นเมื่อถือ `view_document_samples` (บัญชี/การเงิน/บริหาร · Superadmin โดยนิยาม)
 * · การเงินเห็นเมนูบัญชีเฉพาะเมื่อถือสิทธิ์นี้ และข้างในเห็นแค่ตัวอย่างเอกสาร (ไม่เห็นงานบัญชี)
 */
describe('เมนูย่อย "ตัวอย่างเอกสารทั้งหมด" (มติ PO U104)', () => {
  const SAMPLES = { view_document_samples: 'view' as const }

  it('บัญชี/บริหารที่ถือสิทธิ์ เห็นทั้งงานบัญชีและตัวอย่างเอกสาร · Superadmin เห็นเสมอ', () => {
    for (const audience of ['accounting', 'executive'] as const) {
      const holder = { ...VIEWERS[audience], capabilities: SAMPLES }
      expect(canViewMenu(holder, 'accounting.operations')).toBe(true)
      expect(canViewMenu(holder, 'accounting.document-samples')).toBe(true)
      expect(firstVisibleChildPath(holder, 'accounting')).toBe('/accounting')
    }
    expect(canViewMenu(VIEWERS.superadmin, 'accounting.document-samples')).toBe(true)
  })

  it('ไม่ถือสิทธิ์ = ซ่อนเมนูย่อยตัวอย่างเอกสาร (งานบัญชียังเห็นตามเดิม)', () => {
    const accountant = { ...VIEWERS.accounting, capabilities: {} }
    expect(canViewMenu(accountant, 'accounting.operations')).toBe(true)
    expect(canViewMenu(accountant, 'accounting.document-samples')).toBe(false)
  })

  it('การเงินที่ถือสิทธิ์ เห็นเมนูบัญชีเฉพาะตัวอย่างเอกสาร · แท็บแรก = หน้าตัวอย่าง · ไม่ถือ = ไม่เห็นเมนูบัญชี', () => {
    const finance = { ...VIEWERS.finance, capabilities: SAMPLES }
    expect(canViewMenu(finance, 'accounting')).toBe(true)
    expect(canViewMenu(finance, 'accounting.operations')).toBe(false)
    expect(canViewMenu(finance, 'accounting.document-samples')).toBe(true)
    expect(firstVisibleChildPath(finance, 'accounting')).toBe('/accounting/document-samples')
    expect(canViewMenu({ ...VIEWERS.finance, capabilities: { manage_billing: 'manage' } }, 'accounting')).toBe(false)
  })

  it('role อื่นไม่เห็นแม้ถือสิทธิ์ (เมนูบัญชีไม่ใช่ของ role นั้น)', () => {
    for (const audience of ['admin_office', 'case_approver', 'team_lead', 'field_agent', 'company_user'] as const) {
      expect(canViewMenu({ ...VIEWERS[audience], capabilities: SAMPLES }, 'accounting.document-samples')).toBe(false)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  COMPANY_ADMIN_ROLE_NAME,
  COMPANY_MANAGER_ROLE_NAME,
  COMPANY_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'
import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'
import {
  canAccess,
  canViewerAccess,
  evaluatePortalGate,
  PORTAL_SECTION_CAPABILITY,
  PORTAL_SECTIONS,
  visiblePortalSections,
  type PortalSection,
  type PortalViewer,
} from '@/lib/portal/access'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

function defaultCapabilitiesOf(roleName: string): Record<string, CapabilityAccessLevel> {
  const result: Record<string, CapabilityAccessLevel> = {}
  for (const assignment of DEFAULT_ROLE_CAPABILITIES) {
    if (assignment.role.roleGroup === 'finance_company' && assignment.role.name === roleName) {
      result[assignment.capabilityCode] = assignment.level
    }
  }
  return result
}

function companyViewer(roleName: string): PortalViewer {
  return { roleGroup: 'finance_company', isSuperadmin: false, capabilities: defaultCapabilitiesOf(roleName) }
}

// ค่าเริ่มต้น `97` §13 (มติ O43 D1)
const EXPECTED: Record<string, Record<PortalSection, boolean>> = {
  [COMPANY_MANAGER_ROLE_NAME]: { cases: true, finance: true, handover: true, profile: true },
  [COMPANY_SUPERVISOR_ROLE_NAME]: { cases: true, finance: false, handover: true, profile: true },
  [COMPANY_ADMIN_ROLE_NAME]: { cases: true, finance: false, handover: false, profile: true },
}

describe('portal access — ค่าเริ่มต้น 3 role × หมวด', () => {
  for (const [roleName, expected] of Object.entries(EXPECTED)) {
    for (const section of PORTAL_SECTIONS) {
      it(`${roleName} · ${section} = ${expected[section]}`, () => {
        const viewer = companyViewer(roleName)
        expect(canViewerAccess(viewer, section)).toBe(expected[section])
        // ทุก role ได้ portal_download ⇒ ดาวน์โหลดได้เท่ากับสิทธิ์หมวด
        expect(canViewerAccess(viewer, section, { download: true })).toBe(expected[section])
      })
    }
  }

  it('visiblePortalSections เรียงตามเมนู', () => {
    expect(visiblePortalSections(companyViewer(COMPANY_ADMIN_ROLE_NAME))).toEqual(['cases', 'profile'])
  })
})

describe('portal access — กติกา', () => {
  it('manage = view', () => {
    expect(canAccess('finance', { portal_finance: 'manage' })).toBe(true)
  })

  it('ดาวน์โหลดต้องมีทั้ง portal_download และสิทธิ์หมวด', () => {
    expect(canAccess('finance', { portal_finance: 'view' }, { download: true })).toBe(false)
    expect(canAccess('finance', { portal_download: 'view' }, { download: true })).toBe(false)
    expect(canAccess('finance', { portal_finance: 'view', portal_download: 'view' }, { download: true })).toBe(true)
  })

  it('Superadmin / role ภายใน ไม่มีสิทธิ์แม้มี capability', () => {
    const all = Object.fromEntries(
      [...Object.values(PORTAL_SECTION_CAPABILITY), 'portal_download'].map((code) => [code, 'manage' as const]),
    )
    expect(canViewerAccess({ roleGroup: 'system', isSuperadmin: true, capabilities: all }, 'cases')).toBe(false)
    expect(canViewerAccess({ roleGroup: 'system', isSuperadmin: false, capabilities: all }, 'cases')).toBe(false)
    expect(canViewerAccess({ roleGroup: 'inhouse', isSuperadmin: false, capabilities: all }, 'profile')).toBe(false)
  })
})

describe('portal gate — ลำดับตรวจ (97 §17)', () => {
  const manager = companyViewer(COMPANY_MANAGER_ROLE_NAME)
  const supervisor = companyViewer(COMPANY_SUPERVISOR_ROLE_NAME)

  it('ผ่านเมื่อครบ', () => {
    expect(evaluatePortalGate({ viewer: manager, userStatus: 'active', companyStatus: 'active' }, 'finance')).toEqual({ ok: true })
  })

  it('role ภายในโดน PERMISSION_DENIED ก่อนเช็คสถานะ', () => {
    const superadmin: PortalViewer = { roleGroup: 'system', isSuperadmin: true, capabilities: {} }
    expect(evaluatePortalGate({ viewer: superadmin, userStatus: 'suspended', companyStatus: null }, 'cases')).toEqual({
      ok: false,
      code: 'PERMISSION_DENIED',
    })
  })

  it('ผู้ใช้ปิด → ACCOUNT_INACTIVE ก่อน COMPANY_SUSPENDED', () => {
    expect(evaluatePortalGate({ viewer: manager, userStatus: 'suspended', companyStatus: 'suspended' }, 'cases')).toEqual({
      ok: false,
      code: 'ACCOUNT_INACTIVE',
    })
  })

  it('บริษัทระงับ → COMPANY_SUSPENDED ก่อนสิทธิ์หมวด', () => {
    expect(evaluatePortalGate({ viewer: supervisor, userStatus: 'active', companyStatus: 'suspended' }, 'finance')).toEqual({
      ok: false,
      code: 'COMPANY_SUSPENDED',
    })
  })

  it('หัวหน้าเรียกหมวดการเงิน → PERMISSION_DENIED (97 §20)', () => {
    expect(evaluatePortalGate({ viewer: supervisor, userStatus: 'active', companyStatus: 'active' }, 'finance')).toEqual({
      ok: false,
      code: 'PERMISSION_DENIED',
    })
  })
})

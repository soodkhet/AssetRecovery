import { describe, expect, it } from 'vitest'
import { canAccess, PORTAL_SECTIONS } from '@/lib/portal/access'
import {
  canViewPortalAs,
  isPortalViewAsCompanyId,
  PORTAL_VIEW_AS_CAPABILITIES,
  portalApiUrl,
  portalPageHref,
  portalViewAsHomePath,
  readPortalViewAsParam,
  stripPortalViewAsPrefix,
  VIEW_CLIENT_PORTAL_AS_CAPABILITY,
} from '@/lib/portal/view-as'

/** โหมด "ดู portal ในฐานะลูกค้า" (มติ PO 05/10/2569 U59) — ส่วน pure */

const CO = '00000000-0000-4000-8000-00000000000a'

describe('canViewPortalAs', () => {
  it('ผู้ใช้ภายในที่ถือ view_client_portal_as (view/manage) · Superadmin โดยนิยาม', () => {
    expect(canViewPortalAs({ isSuperadmin: false, roleGroup: 'system', capabilities: { [VIEW_CLIENT_PORTAL_AS_CAPABILITY]: 'view' } })).toBe(true)
    expect(canViewPortalAs({ isSuperadmin: false, roleGroup: 'inhouse', capabilities: { [VIEW_CLIENT_PORTAL_AS_CAPABILITY]: 'manage' } })).toBe(true)
    expect(canViewPortalAs({ isSuperadmin: true, roleGroup: 'system', capabilities: {} })).toBe(true)
  })

  it('ไม่มี record = ไม่มีสิทธิ์ · ผู้ใช้บริษัทไม่ได้แม้ถูกผูก capability นี้', () => {
    expect(canViewPortalAs({ isSuperadmin: false, roleGroup: 'system', capabilities: { portal_finance: 'view' } })).toBe(false)
    expect(
      canViewPortalAs({ isSuperadmin: false, roleGroup: 'finance_company', capabilities: { [VIEW_CLIENT_PORTAL_AS_CAPABILITY]: 'view' } }),
    ).toBe(false)
  })
})

describe('สิทธิ์หมวดของโหมดดูแทน = ผู้จัดการบริษัท', () => {
  it('ทุกหมวด + ดาวน์โหลด', () => {
    for (const section of PORTAL_SECTIONS) {
      expect(canAccess(section, PORTAL_VIEW_AS_CAPABILITIES), section).toBe(true)
      expect(canAccess(section, PORTAL_VIEW_AS_CAPABILITIES, { download: true }), section).toBe(true)
    }
  })
})

describe('URL ของโหมดดูแทน', () => {
  it('หน้า /portal → /portal/view-as/<id> (รักษา query) · null = เดิม · path อื่นไม่แตะ', () => {
    expect(portalViewAsHomePath(CO)).toBe(`/portal/view-as/${CO}`)
    expect(portalPageHref('/portal', CO)).toBe(`/portal/view-as/${CO}`)
    expect(portalPageHref('/portal/cases?status=recovered&page=2', CO)).toBe(`/portal/view-as/${CO}/cases?status=recovered&page=2`)
    expect(portalPageHref('/portal?x=1', CO)).toBe(`/portal/view-as/${CO}?x=1`)
    expect(portalPageHref('/portal/billing', null)).toBe('/portal/billing')
    expect(portalPageHref('/portals', CO)).toBe('/portals')
    expect(portalPageHref('/dashboard', CO)).toBe('/dashboard')
  })

  it('API เติม as ต่อท้ายถูกตัวคั่น · null = เดิม', () => {
    expect(portalApiUrl('/api/portal/billing-batches', CO)).toBe(`/api/portal/billing-batches?as=${CO}`)
    expect(portalApiUrl('/api/portal/cases?page=2', CO)).toBe(`/api/portal/cases?page=2&as=${CO}`)
    expect(portalApiUrl('/api/portal/cases#x', CO)).toBe(`/api/portal/cases?as=${CO}#x`)
    expect(portalApiUrl('/api/portal/cases', null)).toBe('/api/portal/cases')
  })

  it('pathname ของโหมดดูแทน → pathname portal ปกติ (หาแท็บที่เปิด)', () => {
    expect(stripPortalViewAsPrefix(`/portal/view-as/${CO}`)).toBe('/portal')
    expect(stripPortalViewAsPrefix(`/portal/view-as/${CO}/handover`)).toBe('/portal/handover')
    expect(stripPortalViewAsPrefix('/portal/cases')).toBe('/portal/cases')
  })

  it('อ่าน as จาก request · ค่าว่างถือว่าส่งมา (ยามปฏิเสธ) · ไม่มี request = null', () => {
    expect(readPortalViewAsParam(new Request(`http://localhost/api/portal/cases?as=${CO}`))).toBe(CO)
    expect(readPortalViewAsParam(new Request('http://localhost/api/portal/cases?as='))).toBe('')
    expect(readPortalViewAsParam(new Request('http://localhost/api/portal/cases'))).toBeNull()
    expect(readPortalViewAsParam(undefined)).toBeNull()
  })

  it('id ต้องเป็น uuid', () => {
    expect(isPortalViewAsCompanyId(CO)).toBe(true)
    expect(isPortalViewAsCompanyId('not-a-uuid')).toBe(false)
    expect(isPortalViewAsCompanyId(`${CO}' OR 1=1`)).toBe(false)
  })
})

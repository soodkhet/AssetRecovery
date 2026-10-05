import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
import { hasCapability } from '@/lib/auth/permission'
import {
  PORTAL_DOWNLOAD_CAPABILITY,
  PORTAL_SECTION_CAPABILITY,
  PORTAL_SECTIONS,
  type PortalCapabilities,
} from '@/lib/portal/access'

/**
 * โหมด "ดู portal ในฐานะลูกค้า" ของผู้ใช้ภายใน (มติ PO 05/10/2569 U59 · `97` §13.1) — pure
 *
 * - ผู้ใช้ภายในยังเป็นตัวเองทุก request (ไม่สลับ session / ไม่ปลอมตัวเป็นผู้ใช้บริษัท) — บริษัทเป้าหมายส่งมาทาง
 *   path ของหน้า (`/portal/view-as/<companyId>/...`) และ query `?as=<companyId>` ของ `/api/portal/*`
 * - ยามฝั่ง server resolve "บริษัทของ portal" = บริษัทนั้น **เฉพาะเมื่อ** ผู้เรียกเป็นผู้ใช้ภายในที่ถือ
 *   capability `view_client_portal_as` (Superadmin โดยนิยาม) และบริษัทอยู่ใน org เดียวกัน
 * - ผู้ใช้บริษัทจริงส่ง `as` มา = 403 (ห้ามใช้ข้ามบริษัท)
 * - เห็นเหมือนผู้จัดการของบริษัท (ทุกหมวด + ดาวน์โหลด) · อ่านอย่างเดียว (portal เป็น GET ล้วน)
 */

export const VIEW_CLIENT_PORTAL_AS_CAPABILITY = 'view_client_portal_as'

/** query ของ `/api/portal/*` ที่ระบุบริษัทเป้าหมายในโหมดนี้ */
export const PORTAL_VIEW_AS_PARAM = 'as'

/** ฐาน path ของหน้า portal ในโหมดนี้ — `/portal/view-as/<companyId>` */
export const PORTAL_VIEW_AS_BASE_PATH = '/portal/view-as'

const PORTAL_PAGE_ROOT = '/portal'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isPortalViewAsCompanyId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export interface PortalViewAsViewer {
  isSuperadmin: boolean
  roleGroup: RoleGroup
  capabilities: Readonly<Record<string, CapabilityAccessLevel>>
}

/** ผู้ใช้ภายใน (ไม่ใช่กลุ่ม `finance_company`) ที่ถือ `view_client_portal_as` ระดับ view ขึ้นไป · Superadmin เสมอ */
export function canViewPortalAs(viewer: PortalViewAsViewer): boolean {
  if (viewer.roleGroup === 'finance_company' && !viewer.isSuperadmin) return false
  return hasCapability(viewer, 'view', VIEW_CLIENT_PORTAL_AS_CAPABILITY)
}

/** สิทธิ์หมวดของโหมดนี้ = ผู้จัดการของบริษัท (ทุกหมวด + ดาวน์โหลด) — ไม่อ่านจาก role ของผู้ดู */
export const PORTAL_VIEW_AS_CAPABILITIES: PortalCapabilities = Object.freeze({
  ...Object.fromEntries(PORTAL_SECTIONS.map((section) => [PORTAL_SECTION_CAPABILITY[section], 'view' as const])),
  [PORTAL_DOWNLOAD_CAPABILITY]: 'view' as const,
})

export function portalViewAsHomePath(companyId: string): string {
  return `${PORTAL_VIEW_AS_BASE_PATH}/${encodeURIComponent(companyId)}`
}

/**
 * path หน้า portal (`/portal/...`) → path ของโหมดดูแทน (`/portal/view-as/<id>/...`) · `null` = คืนค่าเดิม
 * (รักษา query/hash ไว้ · path นอก `/portal` ไม่แตะ)
 */
export function portalPageHref(href: string, viewAsCompanyId: string | null): string {
  if (viewAsCompanyId === null) return href
  if (href !== PORTAL_PAGE_ROOT && !/^\/portal[/?#]/.test(href)) return href
  return `${portalViewAsHomePath(viewAsCompanyId)}${href.slice(PORTAL_PAGE_ROOT.length)}`
}

/** `/api/portal/...` → เติม `?as=<id>` (หรือ `&as=`) · `null` = คืนค่าเดิม */
export function portalApiUrl(url: string, viewAsCompanyId: string | null): string {
  if (viewAsCompanyId === null) return url
  const hashIndex = url.indexOf('#')
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex)
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}${PORTAL_VIEW_AS_PARAM}=${encodeURIComponent(viewAsCompanyId)}${hash}`
}

/** pathname ของโหมดดูแทน → pathname ของ portal ปกติ (ใช้หาแท็บที่เปิดอยู่) */
export function stripPortalViewAsPrefix(pathname: string): string {
  if (!pathname.startsWith(`${PORTAL_VIEW_AS_BASE_PATH}/`)) return pathname
  const rest = pathname.slice(PORTAL_VIEW_AS_BASE_PATH.length + 1)
  const slash = rest.indexOf('/')
  return slash === -1 ? PORTAL_PAGE_ROOT : `${PORTAL_PAGE_ROOT}${rest.slice(slash)}`
}

/** อ่าน `as` จาก URL ของ request — ไม่มี param = `null` (ค่าว่างยังถือว่า "ส่งมา" ⇒ ยามปฏิเสธ) */
export function readPortalViewAsParam(request: Request | undefined): string | null {
  if (request === undefined) return null
  try {
    return new URL(request.url).searchParams.get(PORTAL_VIEW_AS_PARAM)
  } catch {
    return null
  }
}
